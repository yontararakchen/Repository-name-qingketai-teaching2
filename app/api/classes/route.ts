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

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null) as { classId?: string } | null;
  const classId = body?.classId?.trim();
  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "演示模式不支持删除班级" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后删除班级" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以删除班级" }, { status: 403 });
  if (!classId) return NextResponse.json({ error: "班级编号不能为空" }, { status: 400 });
  if (identity.demo && classId === "class_python") return NextResponse.json({ error: "演示班级不能删除，可以删除你新建的班级" }, { status: 409 });

  const member = await db.prepare("SELECT c.id, c.name FROM classes c JOIN class_members cm ON cm.class_id = c.id WHERE c.id = ? AND cm.user_id = ? AND cm.role = 'teacher' LIMIT 1").bind(classId, identity.demo ? "user_teacher_1" : identity.id).first<{ id: string; name: string }>();
  if (!member) return NextResponse.json({ error: "你不是该班级教师，无法删除" }, { status: 403 });

  const byClass = (sql: string) => db.prepare(sql).bind(classId);
  await db.batch([
    byClass("DELETE FROM personalized_grades WHERE response_id IN (SELECT id FROM personalized_responses WHERE personalized_assignment_id IN (SELECT id FROM personalized_assignments WHERE class_id = ?))"),
    byClass("DELETE FROM personalized_responses WHERE personalized_assignment_id IN (SELECT id FROM personalized_assignments WHERE class_id = ?)"),
    byClass("DELETE FROM personalized_assignments WHERE class_id = ?"),
    byClass("DELETE FROM submission_history WHERE submission_id IN (SELECT id FROM submissions WHERE assignment_id IN (SELECT id FROM assignments WHERE class_id = ?))"),
    byClass("DELETE FROM submissions WHERE assignment_id IN (SELECT id FROM assignments WHERE class_id = ?)"),
    byClass("DELETE FROM assignment_workflow WHERE assignment_id IN (SELECT id FROM assignments WHERE class_id = ?)"),
    byClass("DELETE FROM task_records WHERE task_id IN (SELECT id FROM learning_tasks WHERE class_id = ?)"),
    byClass("DELETE FROM activity_responses WHERE activity_id IN (SELECT id FROM activities WHERE session_id IN (SELECT id FROM lesson_sessions WHERE class_id = ?))"),
    byClass("DELETE FROM activities WHERE session_id IN (SELECT id FROM lesson_sessions WHERE class_id = ?)"),
    byClass("DELETE FROM ai_drafts WHERE class_id = ?"),
    byClass("DELETE FROM learning_events WHERE class_id = ?"),
    byClass("DELETE FROM student_insights WHERE class_id = ?"),
    byClass("DELETE FROM class_insights WHERE class_id = ?"),
    byClass("DELETE FROM student_knowledge_mastery WHERE class_id = ?"),
    db.prepare("DELETE FROM content_knowledge_points WHERE knowledge_point_id IN (SELECT id FROM knowledge_points WHERE chapter_id IN (SELECT id FROM chapters WHERE class_id = ?)) OR (object_type = 'chapter' AND object_id IN (SELECT id FROM chapters WHERE class_id = ?)) OR (object_type = 'material' AND object_id IN (SELECT m.id FROM materials m JOIN chapters c ON c.id = m.chapter_id WHERE c.class_id = ?)) OR (object_type = 'assignment' AND object_id IN (SELECT id FROM assignments WHERE class_id = ?)) OR (object_type = 'learning_task' AND object_id IN (SELECT id FROM learning_tasks WHERE class_id = ?)) OR (object_type = 'activity' AND object_id IN (SELECT a.id FROM activities a JOIN lesson_sessions ls ON ls.id = a.session_id WHERE ls.class_id = ?))").bind(classId, classId, classId, classId, classId, classId),
    db.prepare("DELETE FROM question_bank WHERE chapter_id IN (SELECT id FROM chapters WHERE class_id = ?) OR knowledge_point_id IN (SELECT id FROM knowledge_points WHERE chapter_id IN (SELECT id FROM chapters WHERE class_id = ?))").bind(classId, classId),
    db.prepare("DELETE FROM knowledge_relations WHERE knowledge_point_id IN (SELECT id FROM knowledge_points WHERE chapter_id IN (SELECT id FROM chapters WHERE class_id = ?)) OR prerequisite_id IN (SELECT id FROM knowledge_points WHERE chapter_id IN (SELECT id FROM chapters WHERE class_id = ?))").bind(classId, classId),
    byClass("DELETE FROM material_blobs WHERE material_id IN (SELECT m.id FROM materials m JOIN chapters c ON c.id = m.chapter_id WHERE c.class_id = ?)"),
    byClass("DELETE FROM materials WHERE chapter_id IN (SELECT id FROM chapters WHERE class_id = ?)"),
    byClass("DELETE FROM knowledge_points WHERE chapter_id IN (SELECT id FROM chapters WHERE class_id = ?)"),
    byClass("DELETE FROM assignments WHERE class_id = ?"),
    byClass("DELETE FROM learning_tasks WHERE class_id = ?"),
    byClass("DELETE FROM lesson_sessions WHERE class_id = ?"),
    byClass("DELETE FROM students WHERE class_id = ?"),
    byClass("DELETE FROM chapters WHERE class_id = ?"),
    byClass("DELETE FROM class_members WHERE class_id = ?"),
    byClass("DELETE FROM course_classes WHERE class_id = ?"),
    byClass("DELETE FROM classes WHERE id = ?"),
  ]);
  await writeAudit(db, identity, "delete", "class", classId, member.name);
  return NextResponse.json({ deleted: true, classId, name: member.name, source: "d1" });
}
