import { NextResponse } from "next/server";
import { getIdentity, writeAudit } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const chapterId = String(form?.get("chapterId") ?? "").trim();
  const file = form?.get("file");
  if (!chapterId || !(file instanceof File)) return NextResponse.json({ error: "缺少章节或文件" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "文件不能超过 25MB" }, { status: 413 });
  const allowed = /\.(pdf|ppt|pptx|doc|docx|png|jpg|jpeg)$/i;
  if (!allowed.test(file.name)) return NextResponse.json({ error: "仅支持 PDF、PPT、图片和文档" }, { status: 415 });
  const db = getDatabase();
  if (!db) return NextResponse.json({ material: { id: newId("material"), chapterId, name: file.name, size: file.size }, source: "local-fallback" }, { status: 201 });
  await ensureSchema(db);
  await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后上传资料" }, { status: 401 });
  if (!identity.demo && identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以上传资料" }, { status: 403 });
  const chapter = await db.prepare("SELECT id FROM chapters WHERE id = ? LIMIT 1").bind(chapterId).first<{ id: string }>();
  if (!chapter) return NextResponse.json({ error: "章节不存在" }, { status: 404 });
  const id = newId("material");
  const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";
  const size = file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
  await db.prepare("INSERT INTO materials (id, chapter_id, name, file_type, size_label, download_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, chapterId, file.name, ext, size, null, timestamp()).run();
  await db.prepare("UPDATE chapters SET files_count = files_count + 1 WHERE id = ?").bind(chapterId).run();
  await writeAudit(db, identity, "upload", "material", id, file.name);
  return NextResponse.json({ material: { id, chapterId, name: file.name, type: ext, size }, source: "d1", note: "当前绑定未启用对象存储，仅保存文件元数据。" }, { status: 201 });
}

