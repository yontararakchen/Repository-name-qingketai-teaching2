import { NextResponse } from "next/server";
import { getIdentity, writeAudit, writeLearningEvent } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";
type TaskType = "preview" | "material" | "assignment" | "review";
const typeLabels: Record<TaskType, string> = { preview: "课前预习", material: "学习资料", assignment: "课后作业", review: "课后复习" };

export async function GET(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ tasks: [], source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后查看学习任务" }, { status: 401 });
  const rows = await db.prepare("SELECT t.id, t.chapter_id, t.task_type, t.title, t.description, t.start_at, t.due_at, t.status, COUNT(tr.id) AS completed_count, (SELECT COUNT(*) FROM students st WHERE st.class_id = t.class_id) AS total_students FROM learning_tasks t LEFT JOIN task_records tr ON tr.task_id = t.id AND tr.status = 'completed' WHERE t.class_id = ? GROUP BY t.id ORDER BY COALESCE(t.due_at, '9999') ASC, t.created_at DESC").bind("class_python").all<{ id: string; chapter_id: string | null; task_type: TaskType; title: string; description: string; start_at: string | null; due_at: string | null; status: string; completed_count: number; total_students: number }>();
  const studentRows = identity.role === "student" && !identity.demo ? await db.prepare("SELECT tr.task_id, tr.status, tr.content, tr.completed_at FROM task_records tr JOIN students st ON st.id = tr.student_id JOIN class_members cm ON cm.user_id = ? AND cm.role = 'student' WHERE st.id = tr.student_id").bind(identity.id).all<{ task_id: string; status: string; content: string; completed_at: string | null }>() : { results: [] as { task_id: string; status: string; content: string; completed_at: string | null }[] };
  return NextResponse.json({ tasks: rows.results.map((row) => ({ id: row.id, chapterId: row.chapter_id, type: row.task_type, typeLabel: typeLabels[row.task_type], title: row.title, description: row.description, startAt: row.start_at, dueAt: row.due_at, status: row.status, completedCount: row.completed_count, totalStudents: row.total_students, completed: studentRows.results.some((record) => record.task_id === row.id && record.status === "completed"), record: studentRows.results.find((record) => record.task_id === row.id) ?? null })), source: "d1" });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { title?: string; description?: string; type?: TaskType; chapterId?: string; dueAt?: string } | null;
  const title = body?.title?.trim();
  if (!title || !body?.type || !["preview", "material", "assignment", "review"].includes(body.type)) return NextResponse.json({ error: "任务标题和类型不能为空" }, { status: 400 });
  const db = getDatabase(); if (!db) return NextResponse.json({ task: { id: newId("task"), title, type: body.type, status: "published" }, source: "local-fallback" }, { status: 201 });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后发布学习任务" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以发布学习任务" }, { status: 403 });
  const id = newId("task");
  await db.prepare("INSERT INTO learning_tasks (id, class_id, chapter_id, task_type, title, description, start_at, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'published', ?)").bind(id, "class_python", body.chapterId ?? null, body.type, title, body.description?.trim() ?? "", body.dueAt?.trim() || null, timestamp()).run();
  await writeAudit(db, identity, "create", "learning_task", id, `${body.type}:${title}`);
  return NextResponse.json({ task: { id, title, type: body.type, typeLabel: typeLabels[body.type], status: "published" }, source: "d1" }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { taskId?: string; studentId?: string; content?: string; action?: "complete" | "reopen" } | null;
  if (!body?.taskId) return NextResponse.json({ error: "缺少任务编号" }, { status: 400 });
  const db = getDatabase(); if (!db) return NextResponse.json({ task: { id: body.taskId, completed: body.action !== "reopen" }, source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后更新任务" }, { status: 401 });
  if (identity.role !== "student") return NextResponse.json({ error: "只有学生可以完成学习任务" }, { status: 403 });
  const studentId = body.studentId ?? "student_1"; const status = body.action === "reopen" ? "pending" : "completed"; const now = timestamp();
  const id = newId("task_record");
  await db.prepare("INSERT INTO task_records (id, task_id, student_id, content, status, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(task_id, student_id) DO UPDATE SET content = excluded.content, status = excluded.status, completed_at = excluded.completed_at, updated_at = excluded.updated_at").bind(id, body.taskId, studentId, body.content?.trim() ?? "", status, status === "completed" ? now : null, now).run();
  await writeAudit(db, identity, status === "completed" ? "complete" : "reopen", "learning_task", body.taskId);
  if (status === "completed") await writeLearningEvent(db, { classId: "class_python", studentId, eventType: "task_completed", objectType: "learning_task", objectId: body.taskId });
  return NextResponse.json({ task: { id: body.taskId, completed: status === "completed", status }, source: "d1" });
}
