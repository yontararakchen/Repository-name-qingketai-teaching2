import { NextResponse } from "next/server";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";
import { getIdentity, writeAudit, writeLearningEvent } from "@/db/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { assignmentId?: string; studentId?: string; content?: string } | null;
  if (!body?.assignmentId || !body.studentId) return NextResponse.json({ error: "缺少作业或学生信息" }, { status: 400 });
  const db = getDatabase();
  if (!db) return NextResponse.json({ submission: { id: newId("submission"), assignmentId: body.assignmentId, studentId: body.studentId, status: "submitted" }, source: "local-fallback" }, { status: 201 });

  await ensureSchema(db);
  await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后提交作业" }, { status: 401 });
  if (!identity.demo && identity.role !== "student") return NextResponse.json({ error: "只有学生可以提交作业" }, { status: 403 });
  if (!identity.demo) {
    const member = await db.prepare("SELECT 1 FROM class_members cm JOIN assignments a ON a.class_id = cm.class_id WHERE cm.user_id = ? AND cm.role = 'student' AND a.id = ?").bind(identity.id, body.assignmentId).first();
    if (!member) return NextResponse.json({ error: "你不是该班级成员" }, { status: 403 });
  }
  const time = timestamp();
  const id = newId("submission");
  await db.prepare("INSERT INTO submissions (id, assignment_id, student_id, content, status, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(assignment_id, student_id) DO UPDATE SET content = excluded.content, status = 'submitted', submitted_at = excluded.submitted_at, updated_at = excluded.updated_at").bind(id, body.assignmentId, body.studentId, body.content?.trim() ?? "", "submitted", time, time).run();
  await writeAudit(db, identity, "submit", "submission", id, `assignment=${body.assignmentId}`);
  await writeLearningEvent(db, { classId: "class_python", studentId: body.studentId, eventType: "assignment_submitted", objectType: "submission", objectId: id, payload: { assignmentId: body.assignmentId } });
  return NextResponse.json({ submission: { id, assignmentId: body.assignmentId, studentId: body.studentId, status: "submitted" }, source: "d1" }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { submissionId?: string; score?: string | number | null; feedback?: string | null } | null;
  if (!body?.submissionId) return NextResponse.json({ error: "缺少提交编号" }, { status: 400 });

  const score = body.score === null || body.score === undefined ? "" : String(body.score).trim();
  if (score && (!/^\d{1,3}(?:\.\d{1,2})?$/.test(score) || Number(score) < 0 || Number(score) > 100)) {
    return NextResponse.json({ error: "分数必须是 0-100 的数字" }, { status: 400 });
  }
  const feedback = body.feedback?.trim() ?? "";
  const db = getDatabase();
  if (!db) {
    return NextResponse.json({ submission: { id: body.submissionId, status: "graded", score: score || null, feedback: feedback || null }, source: "local-fallback" });
  }

  await ensureSchema(db);
  await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后评分" }, { status: 401 });
  if (!identity.demo && identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以评分" }, { status: 403 });
  const result = await db.prepare("UPDATE submissions SET score = ?, feedback = ?, status = 'graded', updated_at = ? WHERE id = ?").bind(score || null, feedback || null, timestamp(), body.submissionId).run();
  if (!result.meta.changes) return NextResponse.json({ error: "提交记录不存在" }, { status: 404 });
  const submission = await db.prepare("SELECT id, assignment_id, student_id, content, status, score, feedback, submitted_at FROM submissions WHERE id = ?").bind(body.submissionId).first();
  await writeAudit(db, identity, "grade", "submission", body.submissionId, `score=${score}`);
  const graded = submission as { student_id?: string; assignment_id?: string } | null;
  if (graded?.student_id) await writeLearningEvent(db, { classId: "class_python", studentId: graded.student_id, eventType: "score_awarded", objectType: "submission", objectId: body.submissionId, payload: { assignmentId: graded.assignment_id, score: score || null } });
  return NextResponse.json({ submission, source: "d1" });
}
