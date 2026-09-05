import { NextResponse } from "next/server";
import { getIdentity, resolveClassId, resolveStudentId, writeAudit, writeLearningEvent } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";
type LessonRow = { id: string; class_id: string; chapter_id: string | null; teacher_user_id: string | null; start_time: string; end_time: string | null; status: string };
type ActivityRow = { id: string; session_id: string; activity_type: string; prompt: string; options: string; status: string; created_at: string };
type ResponseRow = { id: string; activity_id: string; student_id: string; answer: string; submitted_at: string };
type StudentNameRow = { id: string; name: string; initials: string };

async function readLesson(db: NonNullable<ReturnType<typeof getDatabase>>, identity: Awaited<ReturnType<typeof getIdentity>>, classId: string) {
  const session = await db.prepare("SELECT id, class_id, chapter_id, teacher_user_id, start_time, end_time, status FROM lesson_sessions WHERE class_id = ? ORDER BY start_time DESC LIMIT 1").bind(classId).first<LessonRow>();
  if (!session) return { session: null, activities: [] };
  const [activityResult, responseResult] = await Promise.all([
    db.prepare("SELECT id, session_id, activity_type, prompt, options, status, created_at FROM activities WHERE session_id = ? ORDER BY created_at").bind(session.id).all<ActivityRow>(),
    db.prepare("SELECT ar.id, ar.activity_id, ar.student_id, ar.answer, ar.submitted_at FROM activity_responses ar JOIN activities a ON a.id = ar.activity_id WHERE a.session_id = ? ORDER BY ar.submitted_at").bind(session.id).all<ResponseRow>(),
  ]);
  const studentResult = await db.prepare("SELECT id, name, initials FROM students WHERE class_id = ?").bind(classId).all<StudentNameRow>();
  const studentNames = new Map(studentResult.results.map((student) => [student.id, student.name]));
  return {
    session: { id: session.id, classId: session.class_id, chapterId: session.chapter_id, startTime: session.start_time, endTime: session.end_time, status: session.status },
    activities: activityResult.results.map((activity) => {
      const responses = responseResult.results.filter((response) => response.activity_id === activity.id);
      const currentStudentId = identity?.role === "student" ? (identity.demo ? "student_1" : studentResult.results.find((student) => student.name === identity.name)?.id) : undefined;
      const options = JSON.parse(activity.options || "[]") as string[];
      const respondents = identity?.role === "teacher" ? Object.fromEntries(options.map((option) => [option, responses.filter((response) => response.answer === option).map((response) => studentNames.get(response.student_id) ?? "学生")] )) : undefined;
      return { id: activity.id, sessionId: activity.session_id, type: activity.activity_type, prompt: activity.prompt, options, status: activity.status, responses: responses.length, distribution: Object.fromEntries(options.map((option) => [option, responses.filter((response) => response.answer === option).length])), respondents, myAnswer: identity?.role === "student" ? responses.find((response) => response.student_id === currentStudentId)?.answer ?? null : null };
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
  const body = await request.json().catch(() => null) as { action?: "start" | "restart" | "publish" | "end"; chapterId?: string; prompt?: string; options?: string[]; classId?: string } | null;
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
  const prompt = body?.prompt?.trim(); const options = (body?.options ?? []).map((option) => option.trim()).filter(Boolean).slice(0, 6);
  if (!prompt || options.length < 2) return NextResponse.json({ error: "题目和至少两个选项不能为空" }, { status: 400 });
  const id = newId("activity"); await db.prepare("INSERT INTO activities (id, session_id, activity_type, prompt, options, status, created_at) VALUES (?, ?, 'choice', ?, ?, 'published', ?)").bind(id, session.id, prompt, JSON.stringify(options), timestamp()).run(); await writeAudit(db, identity, "publish", "activity", id, prompt); return NextResponse.json({ activity: { id, type: "choice", prompt, options, status: "published" }, source: "d1" }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { activityId?: string; studentId?: string; answer?: string } | null;
  if (!body?.activityId || !body.answer?.trim()) return NextResponse.json({ error: "请选择一个答案" }, { status: 400 });
  const db = getDatabase(); if (!db) return NextResponse.json({ response: { activityId: body.activityId, answer: body.answer }, source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后作答" }, { status: 401 });
  if (identity.role !== "student") return NextResponse.json({ error: "只有学生可以提交课堂答案" }, { status: 403 });
  const activity = await db.prepare("SELECT a.session_id, ls.class_id FROM activities a JOIN lesson_sessions ls ON ls.id = a.session_id WHERE a.id = ? LIMIT 1").bind(body.activityId).first<{ session_id: string; class_id: string }>();
  if (!activity) return NextResponse.json({ error: "课堂题目不存在" }, { status: 404 });
  const classId = await resolveClassId(db, identity, activity.class_id); if (!classId) return NextResponse.json({ error: "你不是该班级成员" }, { status: 403 });
  const studentId = await resolveStudentId(db, identity, classId);
  if (!studentId) return NextResponse.json({ error: "当前账号不是本班学生" }, { status: 403 });
  const now = timestamp(); const id = newId("response");
  await db.prepare("INSERT INTO activity_responses (id, activity_id, student_id, answer, submitted_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(activity_id, student_id) DO UPDATE SET answer = excluded.answer, submitted_at = excluded.submitted_at").bind(id, body.activityId, studentId, body.answer.trim(), now).run(); await writeAudit(db, identity, "respond", "activity", body.activityId, body.answer.trim()); await writeLearningEvent(db, { classId, studentId, sessionId: activity?.session_id, eventType: "activity_submitted", objectType: "activity", objectId: body.activityId, payload: { answer: body.answer.trim() } }); return NextResponse.json({ response: { id, activityId: body.activityId, studentId, answer: body.answer.trim() }, source: "d1" });
}
