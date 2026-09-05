import { NextResponse } from "next/server";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";
import { getIdentity, resolveClassId, writeAudit } from "@/db/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { name?: string; chapterId?: string; description?: string; deadline?: string; classId?: string } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "作业名称不能为空" }, { status: 400 });

  const db = getDatabase();
  if (!db) return NextResponse.json({ assignment: { id: newId("assignment"), name, status: "草稿" }, source: "local-fallback" }, { status: 201 });

  await ensureSchema(db);
  await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后创建作业" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以创建作业" }, { status: 403 });
  const classId = await resolveClassId(db, identity, body?.classId); if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const chapterId = body?.chapterId ?? "chapter_3";
  const chapter = await db.prepare("SELECT id FROM chapters WHERE id = ? AND class_id = ? LIMIT 1").bind(chapterId, classId).first();
  if (!chapter) return NextResponse.json({ error: "章节不属于当前班级" }, { status: 403 });
  const id = newId("assignment");
  const createdAt = timestamp();
  await db.batch([db.prepare("INSERT INTO assignments (id, class_id, chapter_id, name, description, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, classId, chapterId, name, body?.description?.trim() ?? "", body?.deadline?.trim() || "未设置", "draft", createdAt), db.prepare("INSERT INTO assignment_workflow (assignment_id, due_at, updated_at) VALUES (?, ?, ?)").bind(id, body?.deadline?.trim() || null, createdAt)]);
  await writeAudit(db, identity, "create", "assignment", id, name);
  return NextResponse.json({ assignment: { id, name, status: "草稿" }, source: "d1" }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { assignmentId?: string; action?: "publish" | "close" | "reopen" | "archive"; deadline?: string; allowLate?: boolean } | null;
  if (!body?.assignmentId || !body.action) return NextResponse.json({ error: "缺少作业操作" }, { status: 400 });
  const db = getDatabase(); if (!db) return NextResponse.json({ error: "演示模式不支持作业操作" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity || identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以管理作业" }, { status: 403 });
  const classId = await resolveClassId(db, identity); if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const assignment = await db.prepare("SELECT id FROM assignments WHERE id = ? AND class_id = ? LIMIT 1").bind(body.assignmentId, classId).first<{ id: string }>(); if (!assignment) return NextResponse.json({ error: "作业不存在" }, { status: 404 });
  const status = body.action === "publish" || body.action === "reopen" ? "active" : body.action === "close" || body.action === "archive" ? "closed" : "draft"; const now = timestamp();
  await db.batch([db.prepare("UPDATE assignments SET status = ?, deadline = COALESCE(?, deadline) WHERE id = ?").bind(status, body.deadline?.trim() || null, body.assignmentId), db.prepare("INSERT INTO assignment_workflow (assignment_id, due_at, allow_late, published_at, closed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(assignment_id) DO UPDATE SET due_at = COALESCE(excluded.due_at, assignment_workflow.due_at), allow_late = excluded.allow_late, published_at = COALESCE(excluded.published_at, assignment_workflow.published_at), closed_at = excluded.closed_at, updated_at = excluded.updated_at").bind(body.assignmentId, body.deadline?.trim() || null, body.allowLate ? 1 : 0, status === "active" ? now : null, status === "closed" ? now : null, now)]);
  await writeAudit(db, identity, body.action, "assignment", body.assignmentId, status); return NextResponse.json({ updated: true, status, source: "d1" });
}
