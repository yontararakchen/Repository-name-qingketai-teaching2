import { NextResponse } from "next/server";
import { getIdentity, resolveClassId, writeAudit, writeLearningEvent } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";

type QuestionRow = { id: string; knowledge_point_id: string | null; knowledge_name: string | null; stem: string; options: string; answer: string; explanation: string; difficulty: string; source_label: string };
type DraftRow = { id: string; chapter_id: string | null; student_id: string; student_name: string; chapter_name: string | null; title: string; description: string; question_ids: string; question_payload: string; status: string; created_at: string; updated_at: string; published_at: string | null; response_answers?: string | null; response_submitted_at?: string | null; response_id?: string | null; response_score?: number | null; response_feedback?: string | null };

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function getContext(db: NonNullable<ReturnType<typeof getDatabase>>, identity: Awaited<ReturnType<typeof getIdentity>>, requestedClassId?: string | null) {
  const classId = await resolveClassId(db, identity, requestedClassId);
  const classRow = classId ? await db.prepare("SELECT id FROM classes WHERE id = ? LIMIT 1").bind(classId).first<{ id: string }>() : null;
  const course = classRow ? await db.prepare("SELECT course_id FROM course_classes WHERE class_id = ? LIMIT 1").bind(classRow.id).first<{ course_id: string }>() : null;
  return classRow ? { classId: classRow.id, courseId: course?.course_id ?? "course_python" } : null;
}

function serializeDraft(row: DraftRow, reveal = true) {
  const questions = parseJson<Record<string, unknown>[]>(row.question_payload, []);
  return { id: row.id, chapterId: row.chapter_id, studentId: row.student_id, studentName: row.student_name, chapterName: row.chapter_name ?? "未分类", title: row.title, description: row.description, questionIds: parseJson<string[]>(row.question_ids, []), questions: reveal ? questions : questions.map(({ answer: _answer, explanation: _explanation, ...question }) => question), status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at, response: row.response_answers ? { id: row.response_id, answers: parseJson<Record<string, string>>(row.response_answers, {}), submittedAt: row.response_submitted_at, score: row.response_score ?? null, feedback: row.response_feedback ?? null } : null };
}

export async function GET(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ drafts: [], recommendations: [], source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后查看个性化作业" }, { status: 401 });
  const context = await getContext(db, identity, new URL(request.url).searchParams.get("classId"));
  if (!context) return NextResponse.json({ drafts: [], recommendations: [], source: "empty" });
  if (identity.role === "teacher") {
    const result = await db.prepare("SELECT pa.id, pa.chapter_id, pa.student_id, st.name AS student_name, c.name AS chapter_name, pa.title, pa.description, pa.question_ids, pa.question_payload, pa.status, pa.created_at, pa.updated_at, pa.published_at, pr.id AS response_id, pr.answers AS response_answers, pr.submitted_at AS response_submitted_at, pg.score AS response_score, pg.feedback AS response_feedback FROM personalized_assignments pa JOIN students st ON st.id = pa.student_id LEFT JOIN chapters c ON c.id = pa.chapter_id LEFT JOIN personalized_responses pr ON pr.personalized_assignment_id = pa.id AND pr.student_id = pa.student_id LEFT JOIN personalized_grades pg ON pg.response_id = pr.id WHERE pa.class_id = ? ORDER BY pa.updated_at DESC").bind(context.classId).all<DraftRow>();
    const students = await db.prepare("SELECT id, name, initials FROM students WHERE class_id = ? ORDER BY created_at").bind(context.classId).all<{ id: string; name: string; initials: string }>();
    return NextResponse.json({ drafts: result.results.map(serializeDraft), students: students.results, source: "d1" });
  }
  const student = identity.demo ? await db.prepare("SELECT id, name FROM students WHERE class_id = ? ORDER BY CASE WHEN id LIKE 'student_demo_%' THEN 0 ELSE 1 END, created_at LIMIT 1").bind(context.classId).first<{ id: string; name: string }>() : await db.prepare("SELECT st.id, st.name FROM students st JOIN users u ON u.name = st.name WHERE u.id = ? AND st.class_id = ? LIMIT 1").bind(identity.id, context.classId).first<{ id: string; name: string }>();
  if (!student) return NextResponse.json({ recommendations: [], source: "d1" });
  const result = await db.prepare("SELECT pa.id, pa.chapter_id, pa.student_id, st.name AS student_name, c.name AS chapter_name, pa.title, pa.description, pa.question_ids, pa.question_payload, pa.status, pa.created_at, pa.updated_at, pa.published_at, pr.id AS response_id, pr.answers AS response_answers, pr.submitted_at AS response_submitted_at, pg.score AS response_score, pg.feedback AS response_feedback FROM personalized_assignments pa JOIN students st ON st.id = pa.student_id LEFT JOIN chapters c ON c.id = pa.chapter_id LEFT JOIN personalized_responses pr ON pr.personalized_assignment_id = pa.id AND pr.student_id = pa.student_id LEFT JOIN personalized_grades pg ON pg.response_id = pr.id WHERE pa.class_id = ? AND pa.student_id = ? AND pa.status = 'published' ORDER BY pa.updated_at DESC").bind(context.classId, student.id).all<DraftRow>();
  return NextResponse.json({ recommendations: result.results.map((row) => serializeDraft(row, false)), source: "d1" });
}

export async function POST(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "演示模式不支持个性化作业保存" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后生成个性化作业" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: "generate" | "submit"; chapterId?: string; studentId?: string; count?: number; draftId?: string; answers?: Record<string, string> };
  if (body.action === "submit") {
    if (identity.role !== "student") return NextResponse.json({ error: "只有学生可以提交个性化作业" }, { status: 403 });
    const context = await getContext(db, identity); if (!context) return NextResponse.json({ error: "暂无课程" }, { status: 404 });
    const student = identity.demo ? await db.prepare("SELECT id FROM students WHERE class_id = ? ORDER BY CASE WHEN id LIKE 'student_demo_%' THEN 0 ELSE 1 END, created_at LIMIT 1").bind(context.classId).first<{ id: string }>() : await db.prepare("SELECT st.id FROM students st JOIN users u ON u.name = st.name WHERE u.id = ? AND st.class_id = ? LIMIT 1").bind(identity.id, context.classId).first<{ id: string }>();
    if (!student || !body.draftId || !body.answers || typeof body.answers !== "object") return NextResponse.json({ error: "提交内容不完整" }, { status: 400 });
    const assignment = await db.prepare("SELECT id FROM personalized_assignments WHERE id = ? AND class_id = ? AND student_id = ? AND status = 'published' LIMIT 1").bind(body.draftId, context.classId, student.id).first<{ id: string }>();
    if (!assignment) return NextResponse.json({ error: "个性化作业不存在或尚未发布" }, { status: 404 });
    const now = timestamp();
    await db.prepare("INSERT INTO personalized_responses (id, personalized_assignment_id, student_id, answers, status, submitted_at, updated_at) VALUES (?, ?, ?, ?, 'submitted', ?, ?) ON CONFLICT(personalized_assignment_id, student_id) DO UPDATE SET answers = excluded.answers, status = 'submitted', submitted_at = excluded.submitted_at, updated_at = excluded.updated_at").bind(newId("personalized_response"), assignment.id, student.id, JSON.stringify(body.answers), now, now).run();
    await writeLearningEvent(db, { classId: context.classId, studentId: student.id, eventType: "personalized_assignment_submitted", objectType: "personalized_assignment", objectId: assignment.id });
    return NextResponse.json({ submitted: true, submittedAt: now, source: "d1" });
  }
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以生成个性化作业" }, { status: 403 });
  const context = await getContext(db, identity);
  if (!context) return NextResponse.json({ error: "暂无课程" }, { status: 404 });
  const chapterId = body.chapterId?.trim(); const studentId = body.studentId?.trim(); const count = Math.min(Math.max(Number(body.count) || 3, 1), 6);
  if (!chapterId || !studentId) return NextResponse.json({ error: "请选择章节和学生" }, { status: 400 });
  const student = await db.prepare("SELECT id, name FROM students WHERE id = ? AND class_id = ? LIMIT 1").bind(studentId, context.classId).first<{ id: string; name: string }>();
  const chapter = await db.prepare("SELECT id, name FROM chapters WHERE id = ? AND class_id = ? LIMIT 1").bind(chapterId, context.classId).first<{ id: string; name: string }>();
  if (!student || !chapter) return NextResponse.json({ error: "学生或章节不存在" }, { status: 404 });
  const questions = await db.prepare("SELECT qb.id, qb.knowledge_point_id, kp.name AS knowledge_name, qb.stem, qb.options, qb.answer, qb.explanation, qb.difficulty, qb.source_label, COALESCE(skm.mastery_score, -1) AS mastery_score FROM question_bank qb LEFT JOIN knowledge_points kp ON kp.id = qb.knowledge_point_id LEFT JOIN student_knowledge_mastery skm ON skm.knowledge_point_id = qb.knowledge_point_id AND skm.student_id = ? AND skm.class_id = ? WHERE qb.chapter_id = ? AND qb.status = 'active' ORDER BY CASE WHEN mastery_score < 0 THEN 0 ELSE mastery_score END ASC, CASE qb.difficulty WHEN 'easy' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, qb.created_at").bind(student.id, context.classId, chapter.id).all<QuestionRow & { mastery_score: number }>();
  const selected = questions.results.slice(0, count);
  if (!selected.length) return NextResponse.json({ error: "该章节题库还没有可用题目" }, { status: 409 });
  const weak = [...new Set(selected.map((item) => item.knowledge_name).filter(Boolean))];
  const payload = selected.map((item) => ({ id: item.id, stem: item.stem, options: parseJson<string[]>(item.options, []), answer: item.answer, explanation: item.explanation, difficulty: item.difficulty, knowledgePoint: item.knowledge_name ?? "未标注知识点", source: item.source_label }));
  const title = `${chapter.name} · ${student.name} 的针对性练习`;
  const description = weak.length ? `根据 ${student.name} 当前掌握证据，优先练习：${weak.join("、")}。共 ${payload.length} 题，教师审核后发布。` : `根据 ${student.name} 的学习记录生成 ${payload.length} 道巩固题，教师审核后发布。`;
  const id = newId("personalized"); const now = timestamp(); const createdBy = identity.demo ? "user_teacher_1" : identity.id;
  await db.prepare("INSERT INTO personalized_assignments (id, class_id, chapter_id, student_id, title, description, question_ids, question_payload, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)").bind(id, context.classId, chapter.id, student.id, title, description, JSON.stringify(selected.map((item) => item.id)), JSON.stringify(payload), createdBy, now, now).run();
  await writeAudit(db, identity, "generate", "personalized_assignment", id, title);
  return NextResponse.json({ draft: { id, chapterId: chapter.id, studentId: student.id, studentName: student.name, chapterName: chapter.name, title, description, questionIds: selected.map((item) => item.id), questions: payload, status: "draft", createdAt: now, updatedAt: now }, source: "d1" }, { status: 201 });
}

export async function PATCH(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "演示模式不支持审核" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity || identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以审核个性化作业" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { draftId?: string; status?: "published" | "rejected"; action?: "grade"; responseId?: string; score?: number; feedback?: string };
  if (body.action === "grade") {
    if (!body.responseId || body.score === undefined || !Number.isFinite(Number(body.score)) || Number(body.score) < 0 || Number(body.score) > 100) return NextResponse.json({ error: "请提供 0-100 的评分" }, { status: 400 });
    const now = timestamp(); const teacherId = identity.demo ? "user_teacher_1" : identity.id; const response = await db.prepare("SELECT pr.id, pa.class_id, pa.student_id, pa.question_payload FROM personalized_responses pr JOIN personalized_assignments pa ON pa.id = pr.personalized_assignment_id WHERE pr.id = ? LIMIT 1").bind(body.responseId).first<{ id: string; class_id: string; student_id: string; question_payload: string }>();
    if (!response) return NextResponse.json({ error: "作答记录不存在" }, { status: 404 }); const classId = await resolveClassId(db, identity, response.class_id); if (!classId) return NextResponse.json({ error: "无权评分该作答" }, { status: 403 });
    await db.prepare("INSERT INTO personalized_grades (response_id, score, total, feedback, graded_by, graded_at) VALUES (?, ?, 100, ?, ?, ?) ON CONFLICT(response_id) DO UPDATE SET score = excluded.score, feedback = excluded.feedback, graded_by = excluded.graded_by, graded_at = excluded.graded_at").bind(response.id, Number(body.score), body.feedback?.trim() ?? "", teacherId, now).run();
    const questions = parseJson<Array<{ id: string; answer?: string; knowledgePoint?: string }>>(response.question_payload, []); const answers = await db.prepare("SELECT answers FROM personalized_responses WHERE id = ?").bind(response.id).first<{ answers: string }>(); const submitted = parseJson<Record<string, string>>(answers?.answers ?? "{}", {});
    for (const question of questions) { const point = await db.prepare("SELECT id FROM knowledge_points WHERE name = ? LIMIT 1").bind(question.knowledgePoint ?? "").first<{ id: string }>(); if (!point) continue; const correct = submitted[question.id] && question.answer && submitted[question.id] === question.answer ? 1 : 0; await db.prepare("INSERT INTO student_knowledge_mastery (id, class_id, student_id, knowledge_point_id, mastery_score, evidence_count, evidence, calculated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(class_id, student_id, knowledge_point_id) DO UPDATE SET mastery_score = ROUND((COALESCE(student_knowledge_mastery.mastery_score, 0) * student_knowledge_mastery.evidence_count + excluded.mastery_score) / (student_knowledge_mastery.evidence_count + 1), 2), evidence_count = student_knowledge_mastery.evidence_count + 1, evidence = excluded.evidence, calculated_at = excluded.calculated_at").bind(newId("mastery"), classId, response.student_id, point.id, correct * 100, JSON.stringify([{ type: "personalized", responseId: response.id, correct: Boolean(correct), score: Number(body.score) }]), now).run(); }
    await writeLearningEvent(db, { classId, studentId: response.student_id, eventType: "personalized_assignment_graded", objectType: "personalized_response", objectId: response.id, payload: { score: Number(body.score) } }); return NextResponse.json({ updated: true, score: Number(body.score), source: "d1" });
  }
  if (!body.draftId || !body.status || !["published", "rejected"].includes(body.status)) return NextResponse.json({ error: "审核参数不正确" }, { status: 400 });
  const reviewedBy = identity.demo ? "user_teacher_1" : identity.id; const now = timestamp();
  const result = await db.prepare("UPDATE personalized_assignments SET status = ?, updated_at = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END, reviewed_at = ?, reviewed_by = ? WHERE id = ? AND status = 'draft'").bind(body.status, now, body.status, now, now, reviewedBy, body.draftId).run();
  if (!result.meta.changes) return NextResponse.json({ error: "草稿不存在或已审核" }, { status: 404 });
  await writeAudit(db, identity, body.status === "published" ? "publish" : "reject", "personalized_assignment", body.draftId, body.status);
  return NextResponse.json({ updated: true, status: body.status, source: "d1" });
}
