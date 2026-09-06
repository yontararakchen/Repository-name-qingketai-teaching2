import { NextResponse } from "next/server";
import { getIdentity, resolveClassId, resolveStudentId, writeAudit, writeLearningEvent } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";
type LessonRow = { id: string; class_id: string; chapter_id: string | null; teacher_user_id: string | null; start_time: string; end_time: string | null; status: string };
type ActivityRow = { id: string; session_id: string; activity_type: string; question_type: string; prompt: string; options: string; correct_answer: string | null; selected_student_id: string | null; selected_at: string | null; status: string; created_at: string };
type ResponseRow = { id: string; activity_id: string; student_id: string; answer: string; score: number | null; feedback: string | null; graded_by: string | null; graded_at: string | null; submitted_at: string };
type DiscussionPostRow = { id: string; activity_id: string; student_id: string; content: string; created_at: string };
type StudentNameRow = { id: string; name: string; initials: string };

async function readLesson(db: NonNullable<ReturnType<typeof getDatabase>>, identity: Awaited<ReturnType<typeof getIdentity>>, classId: string) {
  const session = await db.prepare("SELECT id, class_id, chapter_id, teacher_user_id, start_time, end_time, status FROM lesson_sessions WHERE class_id = ? ORDER BY start_time DESC LIMIT 1").bind(classId).first<LessonRow>();
  if (!session) return { session: null, activities: [] };
  const [activityResult, responseResult, discussionResult] = await Promise.all([
    db.prepare("SELECT id, session_id, activity_type, question_type, prompt, options, correct_answer, selected_student_id, selected_at, status, created_at FROM activities WHERE session_id = ? ORDER BY created_at").bind(session.id).all<ActivityRow>(),
    db.prepare("SELECT ar.id, ar.activity_id, ar.student_id, ar.answer, ar.score, ar.feedback, ar.graded_by, ar.graded_at, ar.submitted_at FROM activity_responses ar JOIN activities a ON a.id = ar.activity_id WHERE a.session_id = ? ORDER BY ar.submitted_at").bind(session.id).all<ResponseRow>(),
    db.prepare("SELECT dp.id, dp.activity_id, dp.student_id, dp.content, dp.created_at FROM activity_discussion_posts dp JOIN activities a ON a.id = dp.activity_id WHERE a.session_id = ? ORDER BY dp.created_at").bind(session.id).all<DiscussionPostRow>(),
  ]);
  const studentResult = await db.prepare("SELECT id, name, initials FROM students WHERE class_id = ?").bind(classId).all<StudentNameRow>();
  const studentNames = new Map(studentResult.results.map((student) => [student.id, student.name]));
  const currentStudentId = identity?.role === "student" ? await resolveStudentId(db, identity, classId) : undefined;
  return {
    session: { id: session.id, classId: session.class_id, chapterId: session.chapter_id, startTime: session.start_time, endTime: session.end_time, status: session.status },
    activities: activityResult.results.map((activity) => {
      const responses = responseResult.results.filter((response) => response.activity_id === activity.id);
      const posts = discussionResult.results.filter((post) => post.activity_id === activity.id);
      const responseItems = activity.question_type === "discussion" ? posts.map((post) => ({ id: post.id, activity_id: post.activity_id, student_id: post.student_id, answer: post.content, score: null, feedback: null, graded_at: null, submitted_at: post.created_at })) : responses;
      const options = JSON.parse(activity.options || "[]") as string[];
      const respondents = identity?.role === "teacher" ? Object.fromEntries(options.map((option) => [option, responseItems.filter((response) => response.answer === option).map((response) => studentNames.get(response.student_id) ?? "学生")] )) : undefined;
      const textResponses = identity?.role === "teacher" ? responseItems.map((response) => ({ responseId: response.id, studentId: response.student_id, studentName: studentNames.get(response.student_id) ?? "学生", answer: response.answer, score: response.score, feedback: response.feedback, gradedAt: response.graded_at })) : undefined;
      return { id: activity.id, sessionId: activity.session_id, type: activity.activity_type, questionType: activity.question_type || activity.activity_type, prompt: activity.prompt, options, status: activity.status, responses: responseItems.length, distribution: Object.fromEntries(options.map((option) => [option, responseItems.filter((response) => response.answer === option).length])), respondents, textResponses, correctAnswer: identity?.role === "teacher" ? activity.correct_answer : null, selectedStudentId: activity.selected_student_id, selectedStudentName: activity.selected_student_id ? studentNames.get(activity.selected_student_id) ?? "学生" : null, selectedAt: activity.selected_at, myAnswer: identity?.role === "student" ? responseItems.find((response) => response.student_id === currentStudentId)?.answer ?? null : null };
    }),
  };
}

export async function GET(request: Request) {
  const db = getDatabase(); if (!db) return NextResponse.json({ session: null, activities: [], source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后查看课堂" }, { status: 401 });
  const classId = await resolveClassId(db, identity, new URL(request.url).searchParams.get("classId")); if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  return NextResponse.json({ ...(await readLesson(db, identity, classId)), source: "d1" });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: "start" | "restart" | "publish" | "end" | "close_activity" | "reopen_activity"; chapterId?: string; prompt?: string; options?: string[]; correctAnswer?: string; classId?: string; activityType?: "choice" | "poll" | "short_answer"; questionType?: "choice" | "poll" | "true_false" | "fill_blank" | "short_answer" | "quick_response" | "discussion" | "select_student" } | null;
  const db = getDatabase(); if (!db) return NextResponse.json({ error: "演示模式不支持课堂持久化" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后操作课堂" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以控制课堂" }, { status: 403 });
  const classId = await resolveClassId(db, identity, body?.classId); if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  if (body?.action === "start" || body?.action === "restart") {
    const active = await db.prepare("SELECT id FROM lesson_sessions WHERE class_id = ? AND status = 'active' LIMIT 1").bind(classId).first<{ id: string }>();
    if (active && body.action === "start" && identity.role !== "teacher") return NextResponse.json({ error: "当前已有进行中的课堂，请结束当前课堂后再开始" }, { status: 409 });
    if (active && (body.action === "restart" || identity.role === "teacher")) await db.prepare("UPDATE lesson_sessions SET status = 'ended', end_time = ? WHERE id = ?").bind(timestamp(), active.id).run();
    const id = newId("lesson"); await db.prepare("INSERT INTO lesson_sessions (id, class_id, chapter_id, teacher_user_id, start_time, status) VALUES (?, ?, ?, ?, ?, 'active')").bind(id, classId, body.chapterId ?? "chapter_3", identity.demo ? null : identity.id, timestamp()).run(); await writeAudit(db, identity, "start", "lesson_session", id); return NextResponse.json({ session: { id, status: "active" }, source: "d1" }, { status: 201 });
  }
  const session = await db.prepare("SELECT id FROM lesson_sessions WHERE class_id = ? AND status = 'active' ORDER BY start_time DESC LIMIT 1").bind(classId).first<{ id: string }>();
  if (!session) return NextResponse.json({ error: "没有进行中的课堂" }, { status: 409 });
  if (body?.action === "end") { await db.prepare("UPDATE lesson_sessions SET status = 'ended', end_time = ? WHERE id = ?").bind(timestamp(), session.id).run(); await writeAudit(db, identity, "end", "lesson_session", session.id); return NextResponse.json({ session: { id: session.id, status: "ended" }, source: "d1" }); }
  const prompt = body?.prompt?.trim(); const questionType = body?.questionType ?? body?.activityType ?? "choice"; const activityType = questionType === "fill_blank" || questionType === "short_answer" || questionType === "quick_response" || questionType === "discussion" || questionType === "select_student" ? "short_answer" : questionType === "poll" ? "poll" : "choice"; const options = (body?.options ?? []).map((option) => option.trim()).filter(Boolean).slice(0, 6); const normalizedOptions = questionType === "true_false" ? ["正确", "错误"] : options; const correctAnswer = (questionType === "choice" || questionType === "true_false") && body?.correctAnswer && normalizedOptions.includes(body.correctAnswer.trim()) ? body.correctAnswer.trim() : null;
  if (!prompt || (activityType !== "short_answer" && normalizedOptions.length < 2)) return NextResponse.json({ error: activityType === "short_answer" ? "题目不能为空" : "题目和至少两个选项不能为空" }, { status: 400 });
  const id = newId("activity"); await db.prepare("INSERT INTO activities (id, session_id, activity_type, question_type, prompt, options, correct_answer, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?)").bind(id, session.id, activityType, questionType, prompt, JSON.stringify(normalizedOptions), correctAnswer, timestamp()).run(); await writeAudit(db, identity, "publish", "activity", id, prompt); return NextResponse.json({ activity: { id, type: activityType, questionType, prompt, options: normalizedOptions, correctAnswer, status: "published" }, source: "d1" }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { activityId?: string; studentId?: string; answer?: string; action?: "close" | "reopen" | "grade_response" | "select_student"; responseId?: string; score?: number | string | null; feedback?: string | null } | null;
  if (body?.action === "grade_response") {
    const db = getDatabase(); if (!db) return NextResponse.json({ error: "演示模式不支持课堂评分" }, { status: 503 }); await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity || identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以评分课堂回答" }, { status: 403 });
    if (!body.responseId) return NextResponse.json({ error: "缺少回答编号" }, { status: 400 });
    const score = body.score === null || body.score === undefined || String(body.score).trim() === "" ? null : Number(body.score); if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) return NextResponse.json({ error: "分数必须是 0-100 的数字" }, { status: 400 });
    const responseRow = await db.prepare("SELECT ar.id, ar.activity_id, ar.student_id, ls.class_id, a.prompt FROM activity_responses ar JOIN activities a ON a.id = ar.activity_id JOIN lesson_sessions ls ON ls.id = a.session_id WHERE ar.id = ? LIMIT 1").bind(body.responseId).first<{ id: string; activity_id: string; student_id: string; class_id: string; prompt: string }>();
    if (!responseRow || !(await resolveClassId(db, identity, responseRow.class_id))) return NextResponse.json({ error: "回答不存在或无权评分" }, { status: 404 });
    const now = timestamp(); await db.prepare("UPDATE activity_responses SET score = ?, feedback = ?, graded_by = ?, graded_at = ? WHERE id = ?").bind(score, body.feedback?.trim() || null, identity.demo ? "user_teacher_1" : identity.id, now, body.responseId).run(); await writeAudit(db, identity, "grade", "activity_response", body.responseId, `score=${score ?? ""}`); await writeLearningEvent(db, { classId: responseRow.class_id, studentId: responseRow.student_id, objectType: "activity_response", objectId: body.responseId, payload: { score, feedback: body.feedback?.trim() || null } }); return NextResponse.json({ updated: true, responseId: body.responseId, score, feedback: body.feedback?.trim() || null, source: "d1" });
  }
  if (body?.action === "select_student") {
    const db = getDatabase(); if (!db) return NextResponse.json({ error: "演示模式不支持选人活动" }, { status: 503 }); await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity || identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以执行选人" }, { status: 403 }); if (!body.activityId) return NextResponse.json({ error: "缺少活动编号" }, { status: 400 });
    const activity = await db.prepare("SELECT a.question_type, ls.class_id FROM activities a JOIN lesson_sessions ls ON ls.id = a.session_id WHERE a.id = ? LIMIT 1").bind(body.activityId).first<{ question_type: string; class_id: string }>(); if (!activity || activity.question_type !== "select_student" || !(await resolveClassId(db, identity, activity.class_id))) return NextResponse.json({ error: "活动不存在或无权操作" }, { status: 404 });
    const students = await db.prepare("SELECT id, name FROM students WHERE class_id = ? ORDER BY id").bind(activity.class_id).all<{ id: string; name: string }>(); if (!students.results.length) return NextResponse.json({ error: "当前班级没有学生" }, { status: 409 }); const selected = students.results[Math.floor(Math.random() * students.results.length)]; const now = timestamp(); await db.prepare("UPDATE activities SET selected_student_id = ?, selected_at = ? WHERE id = ?").bind(selected.id, now, body.activityId).run(); await writeAudit(db, identity, "select", "activity", body.activityId, selected.name); return NextResponse.json({ selectedStudent: { id: selected.id, name: selected.name }, selectedAt: now, source: "d1" });
  }
  if (body?.action && body.activityId) {
    const db = getDatabase(); if (!db) return NextResponse.json({ error: "演示模式不支持活动管理" }, { status: 503 }); await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity || identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以管理活动" }, { status: 403 }); const activity = await db.prepare("SELECT ls.class_id FROM activities a JOIN lesson_sessions ls ON ls.id = a.session_id WHERE a.id = ? LIMIT 1").bind(body.activityId).first<{ class_id: string }>(); if (!activity || !(await resolveClassId(db, identity, activity.class_id))) return NextResponse.json({ error: "活动不存在或无权操作" }, { status: 404 }); await db.prepare("UPDATE activities SET status = ? WHERE id = ?").bind(body.action === "close" ? "closed" : "published", body.activityId).run(); return NextResponse.json({ updated: true, status: body.action === "close" ? "closed" : "published" });
  }
  if (!body?.activityId || !body.answer?.trim()) return NextResponse.json({ error: "请选择一个答案" }, { status: 400 });
  const db = getDatabase(); if (!db) return NextResponse.json({ response: { activityId: body.activityId, answer: body.answer }, source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后作答" }, { status: 401 });
  if (identity.role !== "student") return NextResponse.json({ error: "只有学生可以提交课堂答案" }, { status: 403 });
  const activity = await db.prepare("SELECT a.session_id, a.status, a.question_type, a.correct_answer, ls.class_id FROM activities a JOIN lesson_sessions ls ON ls.id = a.session_id WHERE a.id = ? LIMIT 1").bind(body.activityId).first<{ session_id: string; class_id: string; status: string; question_type: string; correct_answer: string | null }>();
  if (!activity) return NextResponse.json({ error: "课堂题目不存在" }, { status: 404 });
  if (activity.status === "closed") return NextResponse.json({ error: "该活动已关闭" }, { status: 409 });
  const classId = await resolveClassId(db, identity, activity.class_id); if (!classId) return NextResponse.json({ error: "你不是该班级成员" }, { status: 403 });
  const studentId = await resolveStudentId(db, identity, classId);
  if (!studentId) return NextResponse.json({ error: "当前账号不是本班学生" }, { status: 403 });
  const answer = body.answer.trim();
  if (activity.question_type === "discussion") { const id = newId("discussion"); const now = timestamp(); await db.prepare("INSERT INTO activity_discussion_posts (id, activity_id, student_id, content, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, body.activityId, studentId, answer, now).run(); await writeAudit(db, identity, "respond", "discussion", body.activityId, answer); await writeLearningEvent(db, { classId, studentId, sessionId: activity.session_id, eventType: "discussion_posted", objectType: "activity", objectId: body.activityId, payload: { content: answer } }); return NextResponse.json({ response: { id, activityId: body.activityId, studentId, answer, score: null }, source: "d1" }); }
  if (activity.question_type === "quick_response") { const winner = await db.prepare("SELECT student_id FROM activity_responses WHERE activity_id = ? ORDER BY submitted_at LIMIT 1").bind(body.activityId).first<{ student_id: string }>(); if (winner && winner.student_id !== studentId) return NextResponse.json({ error: "这道抢答题已经被其他同学抢答" }, { status: 409 }); }
  const now = timestamp(); const id = newId("response"); const autoScore = activity.correct_answer && (activity.question_type === "choice" || activity.question_type === "true_false") ? (answer === activity.correct_answer ? 100 : 0) : null;
  await db.prepare("INSERT INTO activity_responses (id, activity_id, student_id, answer, score, graded_at, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(activity_id, student_id) DO UPDATE SET answer = excluded.answer, score = excluded.score, graded_at = excluded.graded_at, submitted_at = excluded.submitted_at").bind(id, body.activityId, studentId, answer, autoScore, autoScore === null ? null : now, now).run(); await writeAudit(db, identity, "respond", "activity", body.activityId, answer); await writeLearningEvent(db, { classId, studentId, sessionId: activity?.session_id, eventType: "activity_submitted", objectType: "activity", objectId: body.activityId, payload: { answer, score: autoScore, autoGraded: autoScore !== null } }); return NextResponse.json({ response: { id, activityId: body.activityId, studentId, answer, score: autoScore }, source: "d1" });
}
