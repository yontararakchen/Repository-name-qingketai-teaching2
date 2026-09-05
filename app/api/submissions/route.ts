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

