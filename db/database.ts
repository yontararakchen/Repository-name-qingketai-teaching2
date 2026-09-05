import { env } from "cloudflare:workers";
import type { D1Database } from "@cloudflare/workers-types";
import { schemaStatements } from "@/db/schema";

export type Database = D1Database;

export function getDatabase() {
  return (env as unknown as { DB?: Database }).DB;
}

export async function ensureSchema(db: Database) {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
}

function now() {
  return new Date().toISOString();
}

export async function seedDemoData(db: Database) {
  const existing = await db.prepare("SELECT id FROM classes LIMIT 1").first<{ id: string }>();
  if (existing) {
    await seedIdentityData(db);
    return;
  }

  const createdAt = now();
  await db.batch([
    db.prepare("INSERT INTO classes (id, name, course_name, term, join_code, teacher_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("class_python", "Python 基础班", "Python 程序设计", "2026 春季学期", "PY2026", "王老师", createdAt),
    db.prepare("INSERT INTO chapters (id, class_id, name, files_count, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("chapter_1", "class_python", "第 1 章 变量与数据类型", 3, "published", 1, createdAt),
    db.prepare("INSERT INTO chapters (id, class_id, name, files_count, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("chapter_2", "class_python", "第 2 章 条件判断", 2, "published", 2, createdAt),
    db.prepare("INSERT INTO chapters (id, class_id, name, files_count, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("chapter_3", "class_python", "第 3 章 循环结构", 3, "draft", 3, createdAt),
    db.prepare("INSERT INTO materials (id, chapter_id, name, file_type, size_label, download_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("material_1", "chapter_3", "循环结构讲义.pdf", "PDF", "2.4 MB", null, createdAt),
    db.prepare("INSERT INTO materials (id, chapter_id, name, file_type, size_label, download_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("material_2", "chapter_3", "循环案例.pptx", "PPT", "6.8 MB", null, createdAt),
    db.prepare("INSERT INTO materials (id, chapter_id, name, file_type, size_label, download_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("material_3", "chapter_3", "课堂练习说明.docx", "DOC", "1.2 MB", null, createdAt),
    ...[
      ["student_1", "张三"], ["student_2", "李四"], ["student_3", "王五"], ["student_4", "赵六"], ["student_5", "陈可"],
    ].map(([id, name]) => db.prepare("INSERT INTO students (id, class_id, name, initials, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, "class_python", name, name.slice(0, 1), createdAt)),
    db.prepare("INSERT INTO assignments (id, class_id, chapter_id, name, description, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("assignment_1", "class_python", "chapter_1", "变量基础练习", "完成变量与数据类型练习。", "09-12", "closed", createdAt),
    db.prepare("INSERT INTO assignments (id, class_id, chapter_id, name, description, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("assignment_2", "class_python", "chapter_2", "条件判断练习", "完成条件判断基础练习。", "09-18", "active", createdAt),
    db.prepare("INSERT INTO assignments (id, class_id, chapter_id, name, description, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("assignment_3", "class_python", "chapter_3", "循环结构练习", "请完成三个循环练习，并上传代码或截图。", "未设置", "draft", createdAt),
    db.prepare("INSERT INTO submissions (id, assignment_id, student_id, content, status, score, feedback, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("submission_1", "assignment_2", "student_2", "已完成条件判断练习。", "graded", "88", "思路清晰，注意边界条件。", createdAt, createdAt),
    db.prepare("INSERT INTO submissions (id, assignment_id, student_id, content, status, score, feedback, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("submission_2", "assignment_1", "student_4", "已完成变量基础练习。", "graded", "92", "基础掌握良好。", createdAt, createdAt),
  ]);
  await seedIdentityData(db);
}

async function seedIdentityData(db: Database) {
  const createdAt = now();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)").bind("user_teacher_1", "teacher@example.com", "王老师", "teacher", createdAt),
    db.prepare("INSERT OR IGNORE INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)").bind("user_student_1", "student@example.com", "张三", "student", createdAt),
    db.prepare("INSERT OR IGNORE INTO class_members (class_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)").bind("class_python", "user_teacher_1", "teacher", createdAt),
    db.prepare("INSERT OR IGNORE INTO class_members (class_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)").bind("class_python", "user_student_1", "student", createdAt),
  ]);
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function timestamp() {
  return now();
}
