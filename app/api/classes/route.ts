import { NextResponse } from "next/server";
import { getIdentity, resolveClassId, writeAudit } from "@/db/auth";
import { ensureSchema, getDatabase, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ classes: [], source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后查看班级列表" }, { status: 401 });
  const memberUserId = identity.demo ? (identity.role === "teacher" ? "user_teacher_1" : "user_student_1") : identity.id;
  const rows = identity.demo
    ? await db.prepare("SELECT c.id, c.name, c.course_name, c.term, c.join_code, cm.role, COUNT(st.id) AS student_count FROM classes c JOIN class_members cm ON cm.class_id = c.id AND cm.user_id = ? AND cm.role = ? LEFT JOIN students st ON st.class_id = c.id GROUP BY c.id ORDER BY c.created_at").bind(memberUserId, identity.role).all<{ id: string; name: string; course_name: string; term: string; join_code: string; role: string | null; student_count: number }>()
    : await db.prepare("SELECT c.id, c.name, c.course_name, c.term, c.join_code, cm.role, COUNT(st.id) AS student_count FROM classes c JOIN class_members cm ON cm.class_id = c.id AND cm.user_id = ? LEFT JOIN students st ON st.class_id = c.id GROUP BY c.id ORDER BY c.created_at").bind(identity.id).all<{ id: string; name: string; course_name: string; term: string; join_code: string; role: string; student_count: number }>();
  return NextResponse.json({ classes: rows.results.map((row) => ({ id: row.id, name: row.name, courseName: row.course_name, term: row.term, joinCode: row.join_code, role: row.role ?? identity.role, studentCount: row.student_count })), source: "d1" });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { action?: "remove" | "update"; classId?: string; userId?: string; name?: string; email?: string } | null;
  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "演示模式不支持成员管理" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后管理成员" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以管理成员" }, { status: 403 });
  if (!body?.classId || !body.userId || !["remove", "update"].includes(body.action ?? "")) return NextResponse.json({ error: "成员操作参数不完整" }, { status: 400 });
  if (!(await resolveClassId(db, identity, body.classId))) return NextResponse.json({ error: "你不是该班级教师" }, { status: 403 });
  const member = await db.prepare("SELECT user_id FROM class_members WHERE class_id = ? AND user_id = ? AND role = 'student' LIMIT 1").bind(body.classId, body.userId).first<{ user_id: string }>();
  if (!member) return NextResponse.json({ error: "学生不属于当前班级" }, { status: 404 });
  if (body.action === "remove") {
    await db.prepare("DELETE FROM class_members WHERE class_id = ? AND user_id = ? AND role = 'student'").bind(body.classId, body.userId).run();
    await db.prepare("DELETE FROM students WHERE class_id = ? AND id IN (SELECT id FROM students WHERE class_id = ? AND name = (SELECT name FROM users WHERE id = ?))").bind(body.classId, body.classId, body.userId).run();
    await writeAudit(db, identity, "remove", "class_members", body.classId, body.userId);
    return NextResponse.json({ removed: true, source: "d1" });
  }
  const name = body.name?.trim(); const email = body.email?.trim().toLowerCase();
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "姓名或邮箱格式不正确" }, { status: 400 });
  const previousUser = await db.prepare("SELECT name FROM users WHERE id = ? LIMIT 1").bind(body.userId).first<{ name: string }>();
  await db.prepare("UPDATE users SET name = ?, email = ? WHERE id = ?").bind(name, email, body.userId).run();
  await db.prepare("UPDATE students SET name = ?, initials = ? WHERE class_id = ? AND name = ?").bind(name, name.slice(0, 1), body.classId, previousUser?.name ?? "").run();
  await writeAudit(db, identity, "update", "class_members", body.classId, body.userId);
  return NextResponse.json({ updated: true, source: "d1" });
}
