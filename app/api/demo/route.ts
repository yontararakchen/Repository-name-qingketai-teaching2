import { NextResponse } from "next/server";
import { getIdentity, writeAudit } from "@/db/auth";
import { ensureSchema, getDatabase, seedDemoData, timestamp } from "@/db/database";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "演示数据需要连接数据库" }, { status: 503 });
  await ensureSchema(db); await seedDemoData(db);
  const identity = await getIdentity(request);
  if (!identity) return NextResponse.json({ error: "需要登录后载入演示数据" }, { status: 401 });
  if (identity.role !== "teacher") return NextResponse.json({ error: "只有教师可以载入演示数据" }, { status: 403 });
  const createdAt = timestamp();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO materials (id, chapter_id, name, file_type, size_label, download_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("demo_material_1", "chapter_1", "变量与数据类型讲义.pdf", "PDF", "2.8 MB", null, createdAt),
    db.prepare("INSERT OR IGNORE INTO materials (id, chapter_id, name, file_type, size_label, download_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("demo_material_2", "chapter_1", "变量练习示例.pptx", "PPT", "4.6 MB", null, createdAt),
    db.prepare("INSERT OR IGNORE INTO materials (id, chapter_id, name, file_type, size_label, download_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("demo_material_3", "chapter_2", "条件判断图解.png", "PNG", "860 KB", null, createdAt),
    db.prepare("INSERT OR IGNORE INTO materials (id, chapter_id, name, file_type, size_label, download_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("demo_material_4", "chapter_2", "if-elif-else 课堂练习.docx", "DOC", "1.1 MB", null, createdAt),
    db.prepare("INSERT OR IGNORE INTO materials (id, chapter_id, name, file_type, size_label, download_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("demo_material_5", "chapter_3", "循环结构讲义.pdf", "PDF", "2.4 MB", null, createdAt),
    db.prepare("INSERT OR IGNORE INTO materials (id, chapter_id, name, file_type, size_label, download_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("demo_material_6", "chapter_3", "循环案例.pptx", "PPT", "6.8 MB", null, createdAt),
    db.prepare("INSERT OR IGNORE INTO assignments (id, class_id, chapter_id, name, description, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("demo_assignment_1", "class_python", "chapter_1", "变量基础闯关", "完成 5 道变量与数据类型练习。", "2026-09-08T23:59", "closed", createdAt),
    db.prepare("INSERT OR IGNORE INTO assignments (id, class_id, chapter_id, name, description, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("demo_assignment_2", "class_python", "chapter_2", "条件判断小测", "用 if / elif / else 完成三个情境判断。", "2026-09-12T23:59", "active", createdAt),
    db.prepare("INSERT OR IGNORE INTO assignments (id, class_id, chapter_id, name, description, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("demo_assignment_3", "class_python", "chapter_3", "循环结构练习", "完成三个循环练习，并上传代码或截图。", "2026-09-18T23:59", "active", createdAt),
    db.prepare("INSERT OR IGNORE INTO learning_tasks (id, class_id, chapter_id, task_type, title, description, start_at, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("demo_task_preview", "class_python", "chapter_3", "preview", "预习：循环结构", "阅读讲义，写下一个你见过的循环例子。", createdAt, "2026-09-10T23:59", "published", createdAt),
    db.prepare("INSERT OR IGNORE INTO learning_tasks (id, class_id, chapter_id, task_type, title, description, start_at, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("demo_task_material", "class_python", "chapter_3", "material", "资料：循环案例", "查看案例课件，标记一个不理解的地方。", createdAt, "2026-09-11T23:59", "published", createdAt),
    db.prepare("INSERT OR IGNORE INTO learning_tasks (id, class_id, chapter_id, task_type, title, description, start_at, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("demo_task_assignment", "class_python", "chapter_3", "assignment", "课后作业：循环练习", "完成课堂练习并提交代码。", createdAt, "2026-09-18T23:59", "published", createdAt),
    db.prepare("INSERT OR IGNORE INTO learning_tasks (id, class_id, chapter_id, task_type, title, description, start_at, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("demo_task_review", "class_python", "chapter_2", "review", "复习：条件判断", "回顾 if / elif / else，并完成复习清单。", createdAt, "2026-09-20T23:59", "published", createdAt),
    db.prepare("INSERT OR IGNORE INTO lesson_sessions (id, class_id, chapter_id, teacher_user_id, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("demo_lesson_1", "class_python", "chapter_3", null, "2026-09-05T08:30:00.000Z", "2026-09-05T09:20:00.000Z", "ended"),
    db.prepare("INSERT OR IGNORE INTO activities (id, session_id, activity_type, prompt, options, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("demo_activity_1", "demo_lesson_1", "choice", "下面哪一项可以遍历列表中的每个元素？", JSON.stringify(["for 循环", "if 判断", "print 输出", "import 导入"]), "published", "2026-09-05T08:42:00.000Z"),
    db.prepare("INSERT OR IGNORE INTO activities (id, session_id, activity_type, prompt, options, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("demo_activity_2", "demo_lesson_1", "choice", "range(3) 会产生几个数字？", JSON.stringify(["2 个", "3 个", "4 个", "无限个"]), "published", "2026-09-05T09:00:00.000Z"),
    db.prepare("INSERT OR IGNORE INTO activity_responses (id, activity_id, student_id, answer, submitted_at) VALUES (?, ?, ?, ?, ?)").bind("demo_response_1", "demo_activity_1", "student_1", "for 循环", "2026-09-05T08:44:00.000Z"),
    db.prepare("INSERT OR IGNORE INTO activity_responses (id, activity_id, student_id, answer, submitted_at) VALUES (?, ?, ?, ?, ?)").bind("demo_response_2", "demo_activity_1", "student_2", "for 循环", "2026-09-05T08:45:00.000Z"),
    db.prepare("INSERT OR IGNORE INTO activity_responses (id, activity_id, student_id, answer, submitted_at) VALUES (?, ?, ?, ?, ?)").bind("demo_response_3", "demo_activity_1", "student_3", "if 判断", "2026-09-05T08:46:00.000Z"),
    db.prepare("INSERT OR IGNORE INTO activity_responses (id, activity_id, student_id, answer, submitted_at) VALUES (?, ?, ?, ?, ?)").bind("demo_response_4", "demo_activity_2", "student_1", "3 个", "2026-09-05T09:01:00.000Z"),
    db.prepare("INSERT OR IGNORE INTO activity_responses (id, activity_id, student_id, answer, submitted_at) VALUES (?, ?, ?, ?, ?)").bind("demo_response_5", "demo_activity_2", "student_4", "4 个", "2026-09-05T09:02:00.000Z"),
    db.prepare("INSERT OR IGNORE INTO content_knowledge_points (id, knowledge_point_id, object_type, object_id, created_at) VALUES (?, ?, 'material', ?, ?)").bind("demo_ckp_material_5", "kp_loop_basics", "demo_material_5", createdAt),
    db.prepare("INSERT OR IGNORE INTO content_knowledge_points (id, knowledge_point_id, object_type, object_id, created_at) VALUES (?, ?, 'activity', ?, ?)").bind("demo_ckp_activity_1", "kp_for_iteration", "demo_activity_1", createdAt),
    db.prepare("INSERT OR IGNORE INTO content_knowledge_points (id, knowledge_point_id, object_type, object_id, created_at) VALUES (?, ?, 'activity', ?, ?)").bind("demo_ckp_activity_2", "kp_range_count", "demo_activity_2", createdAt),
    db.prepare("INSERT OR IGNORE INTO content_knowledge_points (id, knowledge_point_id, object_type, object_id, created_at) VALUES (?, ?, 'learning_task', ?, ?)").bind("demo_ckp_task_preview", "kp_loop_basics", "demo_task_preview", createdAt),
    db.prepare("INSERT OR IGNORE INTO content_knowledge_points (id, knowledge_point_id, object_type, object_id, created_at) VALUES (?, ?, 'assignment', ?, ?)").bind("demo_ckp_assignment_3", "kp_for_iteration", "demo_assignment_3", createdAt),
  ]);
  const submissionRows = [
    ["demo_submission_1", "demo_assignment_1", "student_1", "已完成变量练习。", "92", "基础扎实，表达清楚。", "graded"],
    ["demo_submission_2", "demo_assignment_1", "student_2", "已完成变量练习。", "78", "注意类型转换。", "graded"],
    ["demo_submission_3", "demo_assignment_2", "student_1", "三个判断情境已完成。", "86", "条件分支组织得不错。", "graded"],
    ["demo_submission_4", "demo_assignment_2", "student_3", "已提交小测答案。", null, null, "submitted"],
    ["demo_submission_5", "demo_assignment_3", "student_4", "循环代码已提交，等待批改。", null, null, "submitted"],
  ];
  for (const [id, assignmentId, studentId, content, score, feedback, status] of submissionRows) await db.prepare("INSERT INTO submissions (id, assignment_id, student_id, content, status, score, feedback, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(assignment_id, student_id) DO UPDATE SET content = excluded.content, status = excluded.status, score = excluded.score, feedback = excluded.feedback, submitted_at = excluded.submitted_at, updated_at = excluded.updated_at").bind(id, assignmentId, studentId, content, status, score, feedback, createdAt, createdAt).run();
  const taskRecords = [["demo_task_record_1", "demo_task_preview", "student_1"], ["demo_task_record_2", "demo_task_preview", "student_2"], ["demo_task_record_3", "demo_task_material", "student_1"], ["demo_task_record_4", "demo_task_assignment", "student_3"], ["demo_task_record_5", "demo_task_review", "student_4"]];
  for (const [id, taskId, studentId] of taskRecords) await db.prepare("INSERT OR IGNORE INTO task_records (id, task_id, student_id, content, status, completed_at, updated_at) VALUES (?, ?, ?, ?, 'completed', ?, ?)").bind(id, taskId, studentId, "已完成体验数据中的学习任务。", createdAt, createdAt).run();
  const events = [["demo_event_1", "student_1", null, "material_viewed", "material", "demo_material_5"], ["demo_event_2", "student_1", "demo_lesson_1", "activity_submitted", "activity", "demo_activity_1"], ["demo_event_3", "student_2", null, "task_completed", "learning_task", "demo_task_preview"], ["demo_event_4", "student_1", null, "assignment_submitted", "submission", "demo_submission_3"], ["demo_event_5", "student_1", null, "score_awarded", "submission", "demo_submission_1"], ["demo_event_6", "student_3", null, "assignment_submitted", "submission", "demo_submission_4"], ["demo_event_7", "student_4", null, "task_completed", "learning_task", "demo_task_review"]];
  for (const [id, studentId, sessionId, eventType, objectType, objectId] of events) await db.prepare("INSERT OR IGNORE INTO learning_events (id, class_id, student_id, session_id, event_type, object_type, object_id, payload, occurred_at) VALUES (?, 'class_python', ?, ?, ?, ?, ?, '{}', ?)").bind(id, studentId, sessionId, eventType, objectType, objectId, createdAt).run();
  await writeAudit(db, identity, "load", "demo_data", "class_python", "完整体验数据");
  return NextResponse.json({ loaded: true, summary: { materials: 6, assignments: 3, tasks: 4, lessonActivities: 2, submissions: 5, events: 7 }, source: "d1" }, { status: 201 });
}
