import { NextResponse } from "next/server";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { assignmentId?: string; studentId?: string; content?: string } | null;
  if (!body?.assignmentId || !body.studentId) return NextResponse.json({ error: "缺少作业或学生信息" }, { status: 400 });
  const db = getDatabase();
  if (!db) return NextResponse.json({ submission: { id: newId("submission"), assignmentId: body.assignmentId, studentId: body.studentId, status: "submitted" }, source: "local-fallback" }, { status: 201 });

  await ensureSchema(db);
  await seedDemoData(db);
  const time = timestamp();
  const id = newId("submission");
  await db.prepare("INSERT INTO submissions (id, assignment_id, student_id, content, status, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(assignment_id, student_id) DO UPDATE SET content = excluded.content, status = 'submitted', submitted_at = excluded.submitted_at, updated_at = excluded.updated_at").bind(id, body.assignmentId, body.studentId, body.content?.trim() ?? "", "submitted", time, time).run();
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
  const result = await db.prepare("UPDATE submissions SET score = ?, feedback = ?, status = 'graded', updated_at = ? WHERE id = ?").bind(score || null, feedback || null, timestamp(), body.submissionId).run();
  if (!result.meta.changes) return NextResponse.json({ error: "提交记录不存在" }, { status: 404 });
  const submission = await db.prepare("SELECT id, assignment_id, student_id, content, status, score, feedback, submitted_at FROM submissions WHERE id = ?").bind(body.submissionId).first();
  return NextResponse.json({ submission, source: "d1" });
}
