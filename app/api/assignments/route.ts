import { NextResponse } from "next/server";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";
import { getIdentity, writeAudit } from "@/db/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { name?: string; chapterId?: string; description?: string; deadline?: string } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "作业名称不能为空" }, { status: 400 });

  const db = getDatabase();
  if (!db) return NextResponse.json({ assignment: { id: newId("assignment"), name, status: "草稿" }, source: "local-fallback" }, { status: 201 });

  await ensureSchema(db);
  await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后创建作业" }, { status: 401 });
  if (!identity.demo && identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以创建作业" }, { status: 403 });
  const id = newId("assignment");
  await db.prepare("INSERT INTO assignments (id, class_id, chapter_id, name, description, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, "class_python", body?.chapterId ?? "chapter_3", name, body?.description?.trim() ?? "", body?.deadline?.trim() || "未设置", "draft", timestamp()).run();
  await writeAudit(db, identity, "create", "assignment", id, name);
  return NextResponse.json({ assignment: { id, name, status: "草稿" }, source: "d1" }, { status: 201 });
}
