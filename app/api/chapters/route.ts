import { NextResponse } from "next/server";
import { getIdentity, resolveClassId, writeAudit } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { name?: string; classId?: string } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "章节名称不能为空" }, { status: 400 });
  const db = getDatabase();
  if (!db) return NextResponse.json({ chapter: { id: newId("chapter"), name, files: 0, status: "草稿" }, source: "local-fallback" }, { status: 201 });
  await ensureSchema(db);
  await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后创建章节" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以创建章节" }, { status: 403 });
  const classId = await resolveClassId(db, identity, body?.classId);
  if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const order = await db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM chapters WHERE class_id = ?").bind(classId).first<{ next_order: number }>();
  const id = newId("chapter");
  await db.prepare("INSERT INTO chapters (id, class_id, name, files_count, status, sort_order, created_at) VALUES (?, ?, ?, 0, 'draft', ?, ?)").bind(id, classId, name, order?.next_order ?? 1, timestamp()).run();
  await writeAudit(db, identity, "create", "chapter", id, name);
  return NextResponse.json({ chapter: { id, name, files: 0, status: "草稿" }, source: "d1" }, { status: 201 });
}
