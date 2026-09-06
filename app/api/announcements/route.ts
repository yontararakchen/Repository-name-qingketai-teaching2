import { NextResponse } from "next/server";
import { getIdentity, resolveClassId, writeAudit } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";

type AnnouncementRow = { id: string; title: string; content: string; pinned: number; created_by: string; created_at: string; updated_at: string };

export async function GET(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ announcements: [], source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后查看公告" }, { status: 401 });
  const classId = await resolveClassId(db, identity, new URL(request.url).searchParams.get("classId"));
  if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const rows = await db.prepare("SELECT id, title, content, pinned, created_by, created_at, updated_at FROM announcements WHERE class_id = ? ORDER BY pinned DESC, created_at DESC").bind(classId).all<AnnouncementRow>();
  return NextResponse.json({ announcements: rows.results.map((row) => ({ id: row.id, title: row.title, content: row.content, pinned: Boolean(row.pinned), createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at })), source: "d1" });
}

export async function POST(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "演示模式暂不支持保存公告" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后发布公告" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以发布公告" }, { status: 403 });
  const body = await request.json().catch(() => null) as { classId?: string; title?: string; content?: string; pinned?: boolean } | null;
  const classId = await resolveClassId(db, identity, body?.classId);
  const title = body?.title?.trim(); const content = body?.content?.trim();
  if (!classId) return NextResponse.json({ error: "班级不存在或无权操作" }, { status: 403 });
  if (!title || !content) return NextResponse.json({ error: "公告标题和内容不能为空" }, { status: 400 });
  const id = newId("announcement"); const now = timestamp(); const createdBy = identity.demo ? "user_teacher_1" : identity.id;
  await db.prepare("INSERT INTO announcements (id, class_id, title, content, pinned, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, classId, title, content, body?.pinned ? 1 : 0, createdBy, now, now).run();
  await writeAudit(db, identity, "create", "announcement", id, title);
  return NextResponse.json({ announcement: { id, title, content, pinned: Boolean(body?.pinned), createdAt: now }, source: "d1" }, { status: 201 });
}

export async function DELETE(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "演示模式暂不支持删除公告" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后删除公告" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以删除公告" }, { status: 403 });
  const body = await request.json().catch(() => null) as { announcementId?: string } | null;
  const announcementId = body?.announcementId?.trim();
  if (!announcementId) return NextResponse.json({ error: "公告编号不能为空" }, { status: 400 });
  const classId = await resolveClassId(db, identity);
  if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const row = await db.prepare("SELECT id, title FROM announcements WHERE id = ? AND class_id = ? LIMIT 1").bind(announcementId, classId).first<{ id: string; title: string }>();
  if (!row) return NextResponse.json({ error: "公告不存在或无权删除" }, { status: 404 });
  await db.prepare("DELETE FROM announcements WHERE id = ? AND class_id = ?").bind(announcementId, classId).run();
  await writeAudit(db, identity, "delete", "announcement", announcementId, row.title);
  return NextResponse.json({ deleted: true, announcementId, source: "d1" });
}
