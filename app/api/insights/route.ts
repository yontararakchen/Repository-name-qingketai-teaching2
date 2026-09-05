import { NextResponse } from "next/server";
import { getIdentity, resolveClassId, resolveStudentId, writeLearningEvent } from "@/db/auth";
import { ensureSchema, getDatabase, newId, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";

type StudentRow = { id: string; name: string; initials: string };
type TaskRow = { id: string; task_type: string; student_id: string | null; status: string };
type SubmissionRow = { id: string; student_id: string; score: string | null };
type ActivityRow = { id: string; student_id: string };
type EventRow = { id: string; student_id: string | null; event_type: string; object_type: string; object_id: string | null; payload: string; occurred_at: string; student_name: string | null };

const eventLabels: Record<string, string> = { task_completed: "完成学习任务", assignment_submitted: "提交作业", activity_submitted: "参加课堂活动", score_awarded: "获得作业评分" };

function percent(value: number) { return Math.round(value * 100); }

export async function GET(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ class: null, students: [], events: [], source: "local-fallback" });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后查看学习分析" }, { status: 401 });
  const classId = await resolveClassId(db, identity, new URL(request.url).searchParams.get("classId")); if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const [studentsResult, tasksResult, submissionsResult, activitiesResult, eventsResult] = await Promise.all([
    db.prepare("SELECT id, name, initials FROM students WHERE class_id = ? ORDER BY created_at").bind(classId).all<StudentRow>(),
    db.prepare("SELECT t.id, t.task_type, tr.student_id, tr.status FROM learning_tasks t LEFT JOIN task_records tr ON tr.task_id = t.id AND tr.status = 'completed' WHERE t.class_id = ?").bind(classId).all<TaskRow>(),
    db.prepare("SELECT s.id, s.student_id, s.score FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.class_id = ?").bind(classId).all<SubmissionRow>(),
    db.prepare("SELECT a.id, ar.student_id FROM activities a JOIN lesson_sessions ls ON ls.id = a.session_id LEFT JOIN activity_responses ar ON ar.activity_id = a.id WHERE ls.class_id = ?").bind(classId).all<ActivityRow>(),
    db.prepare("SELECT e.id, e.student_id, e.event_type, e.object_type, e.object_id, e.payload, e.occurred_at, st.name AS student_name FROM learning_events e LEFT JOIN students st ON st.id = e.student_id WHERE e.class_id = ? ORDER BY e.occurred_at DESC LIMIT 20").bind(classId).all<EventRow>(),
  ]);
  const students = studentsResult.results;
  const tasks = tasksResult.results;
  const submissions = submissionsResult.results;
  const activities = activitiesResult.results;
  const taskCount = new Set(tasks.map((row) => row.id)).size;
  const previewTaskCount = new Set(tasks.filter((row) => row.task_type === "preview").map((row) => row.id)).size;
  const assignmentCount = (await db.prepare("SELECT COUNT(*) AS count FROM assignments WHERE class_id = ?").bind(classId).first<{ count: number }>())?.count ?? 0;
  const activityCount = new Set(activities.map((row) => row.id)).size;
  const completedTaskKeys = new Set(tasks.filter((row) => row.student_id).map((row) => `${row.id}:${row.student_id}`));
  const previewCompleted = new Set(tasks.filter((row) => row.task_type === "preview" && row.student_id).map((row) => `${row.id}:${row.student_id}`)).size;
  const assignmentSubmitted = new Set(submissions.map((row) => `${row.id}:${row.student_id}`)).size;
  const activityParticipated = new Set(activities.filter((row) => row.student_id).map((row) => `${row.id}:${row.student_id}`)).size;
  const scores = submissions.filter((row) => row.score !== null && row.score !== "").map((row) => Number(row.score)).filter((score) => Number.isFinite(score));
  const averageScore = scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null;
  const distribution = { "0-59": 0, "60-69": 0, "70-79": 0, "80-89": 0, "90-100": 0 };
  scores.forEach((score) => { if (score < 60) distribution["0-59"] += 1; else if (score < 70) distribution["60-69"] += 1; else if (score < 80) distribution["70-79"] += 1; else if (score < 90) distribution["80-89"] += 1; else distribution["90-100"] += 1; });
  const classInsights = { previewCompletionRate: percent(students.length && previewTaskCount ? previewCompleted / (students.length * previewTaskCount) : 0), assignmentCompletionRate: percent(students.length && assignmentCount ? assignmentSubmitted / (students.length * assignmentCount) : 0), activityParticipationRate: percent(students.length && activityCount ? activityParticipated / (students.length * activityCount) : 0), averageScore, scoreDistribution: distribution };
  const studentInsights = students.map((student) => {
    const completed = [...completedTaskKeys].filter((key) => key.endsWith(`:${student.id}`)).length;
    const submitted = new Set(submissions.filter((row) => row.student_id === student.id).map((row) => row.id)).size;
    const participated = new Set(activities.filter((row) => row.student_id === student.id).map((row) => row.id)).size;
    const studentScores = submissions.filter((row) => row.student_id === student.id && row.score !== null && row.score !== "").map((row) => Number(row.score)).filter((score) => Number.isFinite(score));
    const studentAverage = studentScores.length ? Math.round((studentScores.reduce((sum, score) => sum + score, 0) / studentScores.length) * 10) / 10 : null;
    const completionRate = taskCount ? completed / taskCount : 0; const assignmentRate = assignmentCount ? submitted / assignmentCount : 0; const activityRate = activityCount ? participated / activityCount : 0;
    const reasons = []; if (completionRate < 0.5) reasons.push("学习任务完成偏低"); if (assignmentRate < 0.5) reasons.push("作业提交不足"); if (activityRate < 0.5) reasons.push("课堂参与偏低");
    return { id: student.id, name: student.name, initials: student.initials, completionRate: percent(completionRate), assignmentRate: percent(assignmentRate), activityRate: percent(activityRate), averageScore: studentAverage, attention: reasons.length > 0, attentionReason: reasons.join("、") || "表现稳定" };
  });
  const currentStudentId = identity.role === "student" ? await resolveStudentId(db, identity, classId) : null;
  const visibleStudents = identity.role === "student" ? studentInsights.filter((student) => student.id === currentStudentId) : studentInsights;
  const calculatedAt = timestamp();
  await db.prepare("INSERT INTO class_insights (id, class_id, preview_completion_rate, assignment_completion_rate, activity_participation_rate, average_score, score_distribution, calculated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(class_id) DO UPDATE SET preview_completion_rate = excluded.preview_completion_rate, assignment_completion_rate = excluded.assignment_completion_rate, activity_participation_rate = excluded.activity_participation_rate, average_score = excluded.average_score, score_distribution = excluded.score_distribution, calculated_at = excluded.calculated_at").bind(newId("class_insight"), classId, classInsights.previewCompletionRate, classInsights.assignmentCompletionRate, classInsights.activityParticipationRate, classInsights.averageScore, JSON.stringify(distribution), calculatedAt).run();
  for (const student of studentInsights) await db.prepare("INSERT INTO student_insights (id, class_id, student_id, completion_rate, assignment_rate, activity_rate, average_score, attention_reason, calculated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(class_id, student_id) DO UPDATE SET completion_rate = excluded.completion_rate, assignment_rate = excluded.assignment_rate, activity_rate = excluded.activity_rate, average_score = excluded.average_score, attention_reason = excluded.attention_reason, calculated_at = excluded.calculated_at").bind(newId("student_insight"), classId, student.id, student.completionRate, student.assignmentRate, student.activityRate, student.averageScore, student.attentionReason, calculatedAt).run();
  return NextResponse.json({ class: classInsights, students: visibleStudents, events: eventsResult.results.map((event) => ({ id: event.id, studentId: event.student_id, studentName: event.student_name ?? "学生", label: eventLabels[event.event_type] ?? event.event_type, eventType: event.event_type, objectType: event.object_type, objectId: event.object_id, occurredAt: event.occurred_at })), source: "d1" });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { eventType?: string; objectType?: string; objectId?: string; sessionId?: string; payload?: Record<string, unknown> } | null;
  const allowed = ["material_viewed", "task_completed", "assignment_submitted", "activity_submitted", "score_awarded", "feedback_viewed", "review_completed"];
  if (!body?.eventType || !allowed.includes(body.eventType) || !body.objectType) return NextResponse.json({ error: "学习事件格式不正确" }, { status: 400 });
  const db = getDatabase(); if (!db) return NextResponse.json({ event: { eventType: body.eventType }, source: "local-fallback" }, { status: 201 });
  await ensureSchema(db); await seedDemoData(db); const identity = await getIdentity(request); if (!identity) return NextResponse.json({ error: "需要登录后记录学习行为" }, { status: 401 });
  if (identity.role !== "student") return NextResponse.json({ error: "只有学生可以记录学习行为" }, { status: 403 });
  const classId = await resolveClassId(db, identity); if (!classId) return NextResponse.json({ error: "当前账号尚未加入任何班级" }, { status: 403 });
  const studentId = await resolveStudentId(db, identity, classId);
  if (!studentId) return NextResponse.json({ error: "未找到学生成员" }, { status: 403 });
  await writeLearningEvent(db, { classId, studentId, sessionId: body.sessionId, eventType: body.eventType, objectType: body.objectType, objectId: body.objectId, payload: body.payload });
  return NextResponse.json({ event: { eventType: body.eventType, studentId }, source: "d1" }, { status: 201 });
}
