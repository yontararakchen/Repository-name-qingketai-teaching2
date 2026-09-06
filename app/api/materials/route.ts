import { NextResponse } from "next/server";
import { getIdentity, resolveClassId, writeAudit } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";
function sizeLabel(size: number) { return size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`; }

export async function GET(request: Request) {
  const db = getDatabase(); if (!db) return NextResponse.json({ materials: [], source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后查看资料" }, { status: 401 });
  const url = new URL(request.url); const materialId = url.searchParams.get("id"); const classId = await resolveClassId(db, identity, url.searchParams.get("classId")); if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  if (materialId) {
    const row = await db.prepare("SELECT m.name, mb.content_type, mb.content_base64, mb.version FROM materials m JOIN chapters c ON c.id = m.chapter_id LEFT JOIN material_blobs mb ON mb.material_id = m.id WHERE m.id = ? AND c.class_id = ? LIMIT 1").bind(materialId, classId).first<{ name: string; content_type: string | null; content_base64: string | null; version: number | null }>();
    if (!row) return NextResponse.json({ error: "资料不存在或无权访问" }, { status: 404 }); if (!row.content_base64) return NextResponse.json({ error: "该资料只有元数据，尚未上传文件内容" }, { status: 404 });
    const bytes = Uint8Array.from(atob(row.content_base64), (char) => char.charCodeAt(0)); return new NextResponse(bytes, { headers: { "Content-Type": row.content_type ?? "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`, "X-Material-Version": String(row.version ?? 1) } });
  }
  const result = await db.prepare("SELECT m.id, m.chapter_id, m.name, m.file_type, m.size_label, m.download_url, mb.version, CASE WHEN mb.material_id IS NULL THEN 0 ELSE 1 END AS stored FROM materials m JOIN chapters c ON c.id = m.chapter_id LEFT JOIN material_blobs mb ON mb.material_id = m.id WHERE c.class_id = ? ORDER BY m.created_at").bind(classId).all<{ id: string; chapter_id: string; name: string; file_type: string; size_label: string; download_url: string | null; version: number | null; stored: number }>();
  return NextResponse.json({ materials: result.results.map((item) => ({ id: item.id, chapterId: item.chapter_id, name: item.name, type: item.file_type, size: item.size_label, downloadUrl: `/api/materials?id=${encodeURIComponent(item.id)}`, version: item.version ?? 1, stored: Boolean(item.stored), originalUrl: item.download_url })), source: "d1" });
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null); const chapterId = String(form?.get("chapterId") ?? "").trim(); const file = form?.get("file");
  if (!chapterId || !(file instanceof File)) return NextResponse.json({ error: "缺少章节或文件" }, { status: 400 }); if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "体验环境单个文件不能超过 8MB" }, { status: 413 });
  if (!/\.(pdf|ppt|pptx|doc|docx|png|jpg|jpeg|txt|md|csv|json)$/i.test(file.name)) return NextResponse.json({ error: "仅支持 PDF、PPT、Word、图片、TXT、Markdown、CSV 和 JSON" }, { status: 415 });
  const db = getDatabase(); if (!db) return NextResponse.json({ material: { id: newId("material"), chapterId, name: file.name, size: file.size }, source: "local-fallback" }, { status: 201 });
  await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后上传资料" }, { status: 401 }); if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以上传资料" }, { status: 403 });
  const classId = await resolveClassId(db, identity); if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 }); const chapter = await db.prepare("SELECT id FROM chapters WHERE id = ? AND class_id = ? LIMIT 1").bind(chapterId, classId).first<{ id: string }>(); if (!chapter) return NextResponse.json({ error: "章节不存在" }, { status: 404 });
  const id = newId("material"); const now = timestamp(); const ext = file.name.split(".").pop()?.toUpperCase() || "FILE"; const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); const base64 = btoa(binary);
  await db.batch([db.prepare("INSERT INTO materials (id, chapter_id, name, file_type, size_label, download_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, chapterId, file.name, ext, sizeLabel(file.size), `/api/materials?id=${encodeURIComponent(id)}`, now), db.prepare("INSERT INTO material_blobs (material_id, content_type, content_base64, uploaded_by, version, updated_at) VALUES (?, ?, ?, ?, 1, ?)").bind(id, file.type || "application/octet-stream", base64, identity.demo ? "user_teacher_1" : identity.id, now), db.prepare("UPDATE chapters SET files_count = files_count + 1 WHERE id = ?").bind(chapterId)]);
  await writeAudit(db, identity, "upload", "material", id, file.name); return NextResponse.json({ material: { id, chapterId, name: file.name, type: ext, size: sizeLabel(file.size), downloadUrl: `/api/materials?id=${encodeURIComponent(id)}`, version: 1, stored: true }, source: "d1", note: "文件内容已保存，可直接下载。" }, { status: 201 });
}

export async function DELETE(request: Request) {
  const payload = await request.json().catch(() => ({})) as { materialId?: string };
  const materialId = String(payload.materialId ?? "").trim();
  if (!materialId) return NextResponse.json({ error: "缺少资料 ID" }, { status: 400 });
  const db = getDatabase();
  if (!db) return NextResponse.json({ deleted: true, materialId, source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后删除资料" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以删除资料" }, { status: 403 });
  const classId = await resolveClassId(db, identity);
  if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const row = await db.prepare("SELECT m.id, m.chapter_id, m.name FROM materials m JOIN chapters c ON c.id = m.chapter_id WHERE m.id = ? AND c.class_id = ? LIMIT 1").bind(materialId, classId).first<{ id: string; chapter_id: string; name: string }>();
  if (!row) return NextResponse.json({ error: "资料不存在或无权删除" }, { status: 404 });
  await db.batch([
    db.prepare("DELETE FROM material_blobs WHERE material_id = ?").bind(materialId),
    db.prepare("DELETE FROM materials WHERE id = ?").bind(materialId),
    db.prepare("UPDATE chapters SET files_count = CASE WHEN files_count > 0 THEN files_count - 1 ELSE 0 END WHERE id = ?").bind(row.chapter_id),
  ]);
  await writeAudit(db, identity, "delete", "material", materialId, row.name);
  return NextResponse.json({ deleted: true, materialId, source: "d1" });
}
