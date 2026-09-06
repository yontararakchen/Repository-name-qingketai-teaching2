import { NextResponse } from "next/server";
import { getIdentity, resolveClassId, resolveStudentId, writeAudit } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";

type PointRow = { id: string; course_id: string; chapter_id: string | null; name: string; description: string; status: string; chapter_name: string | null };
type LinkRow = { id: string; knowledge_point_id: string; object_type: string; object_id: string };
type StudentRow = { id: string; name: string; initials: string };
type AssignmentRow = { id: string; name: string; chapter_name: string | null; score: string | null; student_id: string };
type ActivityRow = { id: string; prompt: string; student_id: string; score: number | null; feedback: string | null };
type EventRow = { id: string; event_type: string; object_type: string; object_id: string | null; student_id: string | null };
type NamedRow = { id: string; name: string };
type RelationRow = { id: string; knowledge_point_id: string; prerequisite_id: string; relation_type: string };

const fallbackPoints = [
  { id: "kp_loop_basics", name: "循环结构基础", description: "理解循环的作用、组成和基本执行过程。", chapterId: "chapter_3", chapterName: "第 3 章 循环结构", status: "active", links: [], students: [], mastery: null },
  { id: "kp_for_iteration", name: "for 循环与遍历", description: "能够使用 for 循环遍历序列并处理每个元素。", chapterId: "chapter_3", chapterName: "第 3 章 循环结构", status: "active", links: [], students: [], mastery: null },
  { id: "kp_range_count", name: "range 与循环次数", description: "理解 range 的参数含义并判断循环执行次数。", chapterId: "chapter_3", chapterName: "第 3 章 循环结构", status: "active", links: [], students: [], mastery: null },
];

function objectLabel(type: string, id: string, names: Record<string, string>) {
  return names[`${type}:${id}`] ?? `${type} · ${id}`;
}

async function getClassAndCourse(db: ReturnType<typeof getDatabase>, identity: NonNullable<Awaited<ReturnType<typeof getIdentity>>>, requestedClassId?: string | null) {
  const classId = await resolveClassId(db!, identity, requestedClassId);
  if (!classId) return null;
  const course = await db!.prepare("SELECT course_id FROM course_classes WHERE class_id = ? LIMIT 1").bind(classId).first<{ course_id: string }>();
  return { classId, courseId: course?.course_id ?? "course_python" };
}

export async function GET(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ course: { id: "course_python", name: "Python 程序设计" }, points: fallbackPoints, students: [], relations: [], source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后查看知识点" }, { status: 401 });
  const context = await getClassAndCourse(db, identity, new URL(request.url).searchParams.get("classId"));
  if (!context) return NextResponse.json({ points: [], students: [], relations: [], source: "empty" });
  const [course, pointsResult, linksResult, relationsResult, studentsResult, assignmentsResult, activitiesResult, eventsResult, materialsResult, tasksResult] = await Promise.all([
    db.prepare("SELECT id, name FROM courses WHERE id = ? LIMIT 1").bind(context.courseId).first<{ id: string; name: string }>(),
    db.prepare("SELECT kp.id, kp.course_id, kp.chapter_id, kp.name, kp.description, kp.status, c.name AS chapter_name FROM knowledge_points kp LEFT JOIN chapters c ON c.id = kp.chapter_id WHERE kp.course_id = ? AND kp.status = 'active' ORDER BY COALESCE(c.sort_order, 999), kp.created_at").bind(context.courseId).all<PointRow>(),
    db.prepare("SELECT id, knowledge_point_id, object_type, object_id FROM content_knowledge_points WHERE knowledge_point_id IN (SELECT id FROM knowledge_points WHERE course_id = ? AND status = 'active')").bind(context.courseId).all<LinkRow>(),
    db.prepare("SELECT id, knowledge_point_id, prerequisite_id, relation_type FROM knowledge_relations WHERE knowledge_point_id IN (SELECT id FROM knowledge_points WHERE course_id = ? AND status = 'active') AND prerequisite_id IN (SELECT id FROM knowledge_points WHERE course_id = ? AND status = 'active')").bind(context.courseId, context.courseId).all<RelationRow>(),
    db.prepare("SELECT id, name, initials FROM students WHERE class_id = ? ORDER BY created_at").bind(context.classId).all<StudentRow>(),
    db.prepare("SELECT s.assignment_id AS id, a.name, c.name AS chapter_name, s.score, s.student_id FROM submissions s JOIN assignments a ON a.id = s.assignment_id LEFT JOIN chapters c ON c.id = a.chapter_id WHERE a.class_id = ?").bind(context.classId).all<AssignmentRow>(),
    db.prepare("SELECT a.id, a.prompt, ar.student_id, ar.score, ar.feedback FROM activities a JOIN lesson_sessions ls ON ls.id = a.session_id LEFT JOIN activity_responses ar ON ar.activity_id = a.id WHERE ls.class_id = ? UNION ALL SELECT a.id, a.prompt, dp.student_id, NULL AS score, NULL AS feedback FROM activities a JOIN lesson_sessions ls ON ls.id = a.session_id LEFT JOIN activity_discussion_posts dp ON dp.activity_id = a.id WHERE ls.class_id = ?").bind(context.classId, context.classId).all<ActivityRow>(),
    db.prepare("SELECT id, event_type, object_type, object_id, student_id FROM learning_events WHERE class_id = ?").bind(context.classId).all<EventRow>(),
    db.prepare("SELECT m.id, m.name FROM materials m JOIN chapters c ON c.id = m.chapter_id WHERE c.class_id = ?").bind(context.classId).all<NamedRow>(),
    db.prepare("SELECT id, title AS name FROM learning_tasks WHERE class_id = ?").bind(context.classId).all<NamedRow>(),
  ]);
  const links = linksResult.results;
  const currentStudentId = identity.role === "student" ? await resolveStudentId(db, identity, context.classId) : null;
  const names: Record<string, string> = {};
  assignmentsResult.results.forEach((row) => { names[`assignment:${row.id}`] = row.name; });
  activitiesResult.results.forEach((row) => { names[`activity:${row.id}`] = row.prompt; });
  materialsResult.results.forEach((row) => { names[`material:${row.id}`] = row.name; });
  tasksResult.results.forEach((row) => { names[`learning_task:${row.id}`] = row.name; });
  const points = pointsResult.results.map((point) => {
    const pointLinks = links.filter((link) => link.knowledge_point_id === point.id).map((link) => ({ id: link.id, objectType: link.object_type, objectId: link.object_id, label: objectLabel(link.object_type, link.object_id, names) }));
    const visibleStudents = identity.role === "student"
      ? studentsResult.results.filter((student) => student.id === (currentStudentId ?? "__none__"))
      : studentsResult.results;
    const mastery = visibleStudents.map((student) => {
      const assignmentIds = new Set(pointLinks.filter((link) => link.objectType === "assignment").map((link) => link.objectId));
      const activityIds = new Set(pointLinks.filter((link) => link.objectType === "activity").map((link) => link.objectId));
      const taskIds = new Set(pointLinks.filter((link) => link.objectType === "learning_task").map((link) => link.objectId));
      const materialIds = new Set(pointLinks.filter((link) => link.objectType === "material").map((link) => link.objectId));
      const evidence: Array<{ type: string; label: string; detail: string; score?: number }> = [];
      const scores = assignmentsResult.results.filter((row) => row.student_id === student.id && assignmentIds.has(row.id) && row.score !== null && row.score !== "").map((row) => Number(row.score)).filter(Number.isFinite);
      assignmentsResult.results.filter((row) => row.student_id === student.id && assignmentIds.has(row.id)).forEach((row) => evidence.push({ type: "assignment", label: row.name, detail: row.score ? `作业得分 ${row.score} 分` : "已提交，等待评分", ...(row.score ? { score: Number(row.score) } : {}) }));
      const activityEvidence = activitiesResult.results.filter((row) => row.student_id === student.id && activityIds.has(row.id));
      const activityScores = activityEvidence.filter((row) => row.score !== null && Number.isFinite(Number(row.score))).map((row) => Number(row.score));
      activityEvidence.forEach((row) => evidence.push({ type: "activity", label: row.prompt, detail: row.score === null ? "参加过课堂活动，等待教师评分" : `课堂回答得分 ${row.score} 分${row.feedback ? ` · ${row.feedback}` : ""}`, ...(row.score !== null ? { score: Number(row.score) } : {}) }));
      eventsResult.results.filter((row) => row.student_id === student.id && ((row.object_type === "learning_task" && taskIds.has(row.object_id ?? "")) || (row.object_type === "material" && materialIds.has(row.object_id ?? "")))).forEach((row) => evidence.push({ type: row.object_type, label: objectLabel(row.object_type, row.object_id ?? "", names), detail: row.event_type === "task_completed" ? "已完成学习任务" : "已查看资料" }));
      const allScores = [...scores, ...activityScores];
      const score = allScores.length ? Math.round((allScores.reduce((sum, value) => sum + value, 0) / allScores.length) * 10) / 10 : null;
      return { studentId: student.id, studentName: student.name, score, evidenceCount: evidence.length, evidence };
    });
    return { id: point.id, name: point.name, description: point.description, chapterId: point.chapter_id, chapterName: point.chapter_name ?? "未归属章节", status: point.status, links: pointLinks, mastery };
  });
  const visibleStudents = identity.role === "student" ? studentsResult.results.filter((student) => student.id === (currentStudentId ?? "__none__")) : studentsResult.results;
  const calculatedAt = timestamp();
  for (const point of points) for (const item of point.mastery) await db.prepare("INSERT INTO student_knowledge_mastery (id, class_id, student_id, knowledge_point_id, mastery_score, evidence_count, evidence, calculated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(class_id, student_id, knowledge_point_id) DO UPDATE SET mastery_score = excluded.mastery_score, evidence_count = excluded.evidence_count, evidence = excluded.evidence, calculated_at = excluded.calculated_at").bind(newId("mastery"), context.classId, item.studentId, point.id, item.score, item.evidenceCount, JSON.stringify(item.evidence), calculatedAt).run();
  const relations = relationsResult.results.map((row) => ({ id: row.id, knowledgePointId: row.knowledge_point_id, prerequisiteId: row.prerequisite_id, relationType: row.relation_type }));
  return NextResponse.json({ course: course ?? { id: context.courseId, name: "课程" }, points, students: visibleStudents, relations, source: "d1" });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: "create" | "link" | "relation"; name?: string; description?: string; chapterId?: string | null; knowledgePointId?: string; prerequisiteId?: string; objectType?: string; objectId?: string; classId?: string } | null;
  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "演示模式不支持知识点保存" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后管理知识点" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以管理知识点" }, { status: 403 });
  const context = await getClassAndCourse(db, identity, body?.classId); if (!context) return NextResponse.json({ error: "当前账号尚未加入班级" }, { status: 403 });
  if (body?.action === "create") {
    const name = body.name?.trim(); if (!name) return NextResponse.json({ error: "知识点名称不能为空" }, { status: 400 });
    const id = newId("kp"); const now = timestamp();
    await db.prepare("INSERT INTO knowledge_points (id, course_id, chapter_id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)").bind(id, context.courseId, body.chapterId || null, name, body.description?.trim() ?? "", now, now).run();
    await writeAudit(db, identity, "create", "knowledge_point", id, name);
    return NextResponse.json({ point: { id, name, description: body.description?.trim() ?? "", chapterId: body.chapterId ?? null, status: "active" }, source: "d1" }, { status: 201 });
  }
  if (body?.action === "link") {
    const allowed = ["chapter", "material", "assignment", "activity", "learning_task"];
    if (!body.knowledgePointId || !body.objectType || !allowed.includes(body.objectType) || !body.objectId) return NextResponse.json({ error: "关联信息不完整" }, { status: 400 });
    const id = newId("ckp"); await db.prepare("INSERT OR IGNORE INTO content_knowledge_points (id, knowledge_point_id, object_type, object_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, body.knowledgePointId, body.objectType, body.objectId, timestamp()).run();
    await writeAudit(db, identity, "link", "knowledge_point", body.knowledgePointId, `${body.objectType}:${body.objectId}`);
    return NextResponse.json({ linked: true, source: "d1" }, { status: 201 });
  }
  if (body?.action === "relation") {
    if (!body.knowledgePointId || !body.prerequisiteId || body.knowledgePointId === body.prerequisiteId) return NextResponse.json({ error: "前置知识点设置不正确" }, { status: 400 });
    const id = newId("relation"); await db.prepare("INSERT OR IGNORE INTO knowledge_relations (id, knowledge_point_id, prerequisite_id, relation_type, created_at) VALUES (?, ?, ?, 'prerequisite', ?)").bind(id, body.knowledgePointId, body.prerequisiteId, timestamp()).run();
    await writeAudit(db, identity, "relate", "knowledge_point", body.knowledgePointId, body.prerequisiteId);
    return NextResponse.json({ linked: true, source: "d1" }, { status: 201 });
  }
  return NextResponse.json({ error: "无效的知识点操作" }, { status: 400 });
}
