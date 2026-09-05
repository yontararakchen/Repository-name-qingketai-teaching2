import { NextResponse } from "next/server";
import { getIdentity, resolveClassId, writeAudit } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";

function splitCsvLine(line: string) {
  const values: string[] = []; let current = ""; let quoted = false;
  for (const char of line) { if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { values.push(current.trim()); current = ""; } else current += char; }
  values.push(current.trim()); return values.map((value) => value.replace(/^"|"$/g, "").trim());
}

export async function POST(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "演示模式不支持名单保存" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后导入学生" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以导入学生" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { csv?: string; classId?: string };
  const lines = (body.csv ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return NextResponse.json({ error: "请至少提供一行学生数据" }, { status: 400 });
  const classId = await resolveClassId(db, identity, body.classId); if (!classId) return NextResponse.json({ error: "当前账号没有可管理的班级" }, { status: 403 });
  const classRow = await db.prepare("SELECT id FROM classes WHERE id = ? LIMIT 1").bind(classId).first<{ id: string }>();
  if (!classRow) return NextResponse.json({ error: "暂无可导入的班级" }, { status: 404 });
  const errors: string[] = []; let imported = 0; let skipped = 0;
  for (let index = 1; index < lines.length; index += 1) {
    const [name = "", email = ""] = splitCsvLine(lines[index]); const row = index + 1;
    if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) { errors.push(`第 ${row} 行姓名或邮箱格式不正确`); skipped += 1; continue; }
    const existingUser = await db.prepare("SELECT id, role FROM users WHERE email = ? LIMIT 1").bind(email.toLowerCase()).first<{ id: string; role: string }>();
    if (existingUser?.role === "teacher") { errors.push(`第 ${row} 行邮箱已属于教师账号`); skipped += 1; continue; }
    const userId = existingUser?.id ?? newId("user"); const student = await db.prepare("SELECT id FROM students WHERE class_id = ? AND (id = ? OR name = ?) LIMIT 1").bind(classRow.id, userId, name).first<{ id: string }>();
    if (student) { skipped += 1; continue; }
    const now = timestamp(); const studentId = userId;
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, 'student', ?)").bind(userId, email.toLowerCase(), name, now),
      db.prepare("INSERT INTO students (id, class_id, name, initials, created_at) VALUES (?, ?, ?, ?, ?)").bind(studentId, classRow.id, name, name.slice(0, 1), now),
      db.prepare("INSERT OR IGNORE INTO class_members (class_id, user_id, role, joined_at) VALUES (?, ?, 'student', ?)").bind(classRow.id, userId, now),
    ]);
    imported += 1;
  }
  await writeAudit(db, identity, "import", "class_members", classRow.id, `imported=${imported};skipped=${skipped}`);
  return NextResponse.json({ imported, skipped, errors, source: "d1" }, { status: 201 });
}
