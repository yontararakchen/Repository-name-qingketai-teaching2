import { NextResponse } from "next/server";
import { getIdentity, writeAudit, writeLearningEvent } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";
type LessonRow = { id: string; class_id: string; chapter_id: string | null; teacher_user_id: string | null; start_time: string; end_time: string | null; status: string };
type ActivityRow = { id: string; session_id: string; activity_type: string; prompt: string; options: string; status: string; created_at: string };
type ResponseRow = { id: string; activity_id: string; student_id: string; answer: string; submitted_at: string };

async function readLesson(db: NonNullable<ReturnType<typeof getDatabase>>, identity: Awaited<ReturnType<typeof getIdentity>>) {
  const session = await db.prepare("SELECT id, class_id, chapter_id, teacher_user_id, start_time, end_time, status FROM lesson_sessions WHERE class_id = ? ORDER BY start_time DESC LIMIT 1").bind("class_python").first<LessonRow>();
  if (!session) return { session: null, activities: [] };
  const [activityResult, responseResult] = await Promise.all([
    db.prepare("SELECT id, session_id, activity_type, prompt, options, status, created_at FROM activities WHERE session_id = ? ORDER BY created_at").bind(session.id).all<ActivityRow>(),
    db.prepare("SELECT ar.id, ar.activity_id, ar.student_id, ar.answer, ar.submitted_at FROM activity_responses ar JOIN activities a ON a.id = ar.activity_id WHERE a.session_id = ? ORDER BY ar.submitted_at").bind(session.id).all<ResponseRow>(),
  ]);
  return {
    session: { id: session.id, classId: session.class_id, chapterId: session.chapter_id, startTime: session.start_time, endTime: session.end_time, status: session.status },
    activities: activityResult.results.map((activity) => {
      const responses = responseResult.results.filter((response) => response.activity_id === activity.id);
      const currentStudentId = identity?.id === "user_student_1" ? "student_1" : identity?.id;
      return { id: activity.id, sessionId: activity.session_id, type: activity.activity_type, prompt: activity.prompt, options: JSON.parse(activity.options || "[]") as string[], status: activity.status, responses: responses.length, distribution: Object.fromEntries((JSON.parse(activity.options || "[]") as string[]).map((option) => [option, responses.filter((response) => response.answer === option).length])), myAnswer: identity?.role === "student" && !identity.demo ? responses.find((response) => response.student_id === currentStudentId)?.answer ?? null : null };
    }),
  };
}

export async function GET(request: Request) {
  const db = getDatabase(); if (!db) return NextResponse.json({ session: null, activities: [], source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后查看课堂" }, { status: 401 });
  return NextResponse.json({ ...(await readLesson(db, identity)), source: "d1" });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: "start" | "restart" | "publish" | "end"; chapterId?: string; prompt?: string; options?: string[] } | null;
  const db = getDatabase(); if (!db) return NextResponse.json({ error: "演示模式不支持课堂持久化" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后操作课堂" }, { status: 401 });
  if (!identity.demo && identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以控制课堂" }, { status: 403 });
  if (body?.action === "start" || body?.action === "restart") {
    const active = await db.prepare("SELECT id FROM lesson_sessions WHERE class_id = ? AND status = 'active' LIMIT 1").bind("class_python").first<{ id: string }>();
    if (active && body.action === "start") return NextResponse.json({ error: "当前已有进行中的课堂，请点击“重新开始体验”" }, { status: 409 });
    if (active && body.action === "restart") await db.prepare("UPDATE lesson_sessions SET status = 'ended', end_time = ? WHERE id = ?").bind(timestamp(), active.id).run();
    const id = newId("lesson"); await db.prepare("INSERT INTO lesson_sessions (id, class_id, chapter_id, teacher_user_id, start_time, status) VALUES (?, ?, ?, ?, ?, 'active')").bind(id, "class_python", body.chapterId ?? "chapter_3", identity.demo ? null : identity.id, timestamp()).run(); await writeAudit(db, identity, "start", "lesson_session", id); return NextResponse.json({ session: { id, status: "active" }, source: "d1" }, { status: 201 });
  }
  const session = await db.prepare("SELECT id FROM lesson_sessions WHERE class_id = ? AND status = 'active' ORDER BY start_time DESC LIMIT 1").bind("class_python").first<{ id: string }>();
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
  if (!identity.demo && identity.role !== "student") return NextResponse.json({ error: "只有学生可以提交课堂答案" }, { status: 403 });
  const studentId = body.studentId ?? "student_1"; const now = timestamp(); const id = newId("response");
  const activity = await db.prepare("SELECT session_id FROM activities WHERE id = ?").bind(body.activityId).first<{ session_id: string }>();
  await db.prepare("INSERT INTO activity_responses (id, activity_id, student_id, answer, submitted_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(activity_id, student_id) DO UPDATE SET answer = excluded.answer, submitted_at = excluded.submitted_at").bind(id, body.activityId, studentId, body.answer.trim(), now).run(); await writeAudit(db, identity, "respond", "activity", body.activityId, body.answer.trim()); await writeLearningEvent(db, { classId: "class_python", studentId, sessionId: activity?.session_id, eventType: "activity_submitted", objectType: "activity", objectId: body.activityId, payload: { answer: body.answer.trim() } }); return NextResponse.json({ response: { id, activityId: body.activityId, studentId, answer: body.answer.trim() }, source: "d1" });
}
