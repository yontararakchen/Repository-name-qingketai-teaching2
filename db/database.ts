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
    await seedTaskData(db);
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
  await seedTaskData(db);
}

async function seedIdentityData(db: Database) {
  const createdAt = now();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)").bind("user_teacher_1", "teacher@example.com", "王老师", "teacher", createdAt),
    db.prepare("INSERT OR IGNORE INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)").bind("user_student_1", "student@example.com", "张三", "student", createdAt),
    db.prepare("INSERT OR IGNORE INTO class_members (class_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)").bind("class_python", "user_teacher_1", "teacher", createdAt),
    db.prepare("INSERT OR IGNORE INTO class_members (class_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)").bind("class_python", "user_student_1", "student", createdAt),
    db.prepare("INSERT OR IGNORE INTO announcements (id, class_id, title, content, pinned, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("announcement_welcome", "class_python", "欢迎来到本学期课程", "请先查看第 3 章资料，并完成课前预习任务。", 1, "user_teacher_1", createdAt, createdAt),
  ]);
}

async function seedTaskData(db: Database) {
  const createdAt = now();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO courses (id, name, description, created_at) VALUES (?, ?, ?, ?)").bind("course_python", "Python 程序设计", "从变量、条件判断到循环结构的入门课程。", createdAt),
    db.prepare("INSERT OR IGNORE INTO course_classes (course_id, class_id) VALUES (?, ?)").bind("course_python", "class_python"),
    db.prepare("INSERT OR IGNORE INTO knowledge_points (id, course_id, chapter_id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)").bind("kp_loop_basics", "course_python", "chapter_3", "循环结构基础", "理解循环的作用、组成和基本执行过程。", createdAt, createdAt),
    db.prepare("INSERT OR IGNORE INTO knowledge_points (id, course_id, chapter_id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)").bind("kp_for_iteration", "course_python", "chapter_3", "for 循环与遍历", "能够使用 for 循环遍历序列并处理每个元素。", createdAt, createdAt),
    db.prepare("INSERT OR IGNORE INTO knowledge_points (id, course_id, chapter_id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)").bind("kp_range_count", "course_python", "chapter_3", "range 与循环次数", "理解 range 的参数含义并判断循环执行次数。", createdAt, createdAt),
    db.prepare("INSERT OR IGNORE INTO knowledge_relations (id, knowledge_point_id, prerequisite_id, relation_type, created_at) VALUES (?, ?, ?, 'prerequisite', ?) ").bind("rel_for_basics", "kp_for_iteration", "kp_loop_basics", createdAt),
    db.prepare("INSERT OR IGNORE INTO knowledge_relations (id, knowledge_point_id, prerequisite_id, relation_type, created_at) VALUES (?, ?, ?, 'prerequisite', ?) ").bind("rel_range_for", "kp_range_count", "kp_for_iteration", createdAt),
    db.prepare("INSERT OR IGNORE INTO content_knowledge_points (id, knowledge_point_id, object_type, object_id, created_at) VALUES (?, ?, 'material', ?, ?)").bind("ckp_loop_material", "kp_loop_basics", "material_1", createdAt),
    db.prepare("INSERT OR IGNORE INTO content_knowledge_points (id, knowledge_point_id, object_type, object_id, created_at) VALUES (?, ?, 'assignment', ?, ?)").bind("ckp_loop_assignment", "kp_for_iteration", "assignment_3", createdAt),
    db.prepare("INSERT OR IGNORE INTO question_bank (id, course_id, chapter_id, knowledge_point_id, stem, options, answer, explanation, difficulty, source_label, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)").bind("qb_loop_1", "course_python", "chapter_3", "kp_loop_basics", "循环结构通常用于解决什么问题？", JSON.stringify(["重复执行一段逻辑", "定义一个类", "导入第三方库", "声明常量"]), "重复执行一段逻辑", "循环适合表达需要重复执行的过程。", "easy", "循环结构讲义.pdf · 第 2 页", createdAt),
    db.prepare("INSERT OR IGNORE INTO question_bank (id, course_id, chapter_id, knowledge_point_id, stem, options, answer, explanation, difficulty, source_label, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)").bind("qb_loop_2", "course_python", "chapter_3", "kp_for_iteration", "下面哪一项最适合遍历列表中的每个元素？", JSON.stringify(["for 循环", "if 判断", "import 导入", "return 返回"]), "for 循环", "for 循环可以依次取出序列中的元素。", "easy", "循环案例.pptx · 第 3 页", createdAt),
    db.prepare("INSERT OR IGNORE INTO question_bank (id, course_id, chapter_id, knowledge_point_id, stem, options, answer, explanation, difficulty, source_label, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)").bind("qb_loop_3", "course_python", "chapter_3", "kp_range_count", "range(3) 会产生几个数字？", JSON.stringify(["2 个", "3 个", "4 个", "无限个"]), "3 个", "range(3) 产生 0、1、2，共 3 个数字。", "easy", "循环结构讲义.pdf · 第 4 页", createdAt),
    db.prepare("INSERT OR IGNORE INTO question_bank (id, course_id, chapter_id, knowledge_point_id, stem, options, answer, explanation, difficulty, source_label, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)").bind("qb_loop_4", "course_python", "chapter_3", "kp_for_iteration", "执行 for i in range(1, 4) 后，i 的最后一个值是什么？", JSON.stringify(["1", "2", "3", "4"]), "3", "range(1, 4) 的取值为 1、2、3，不包含 4。", "medium", "课堂练习说明.docx · 第 1 页", createdAt),
    db.prepare("INSERT OR IGNORE INTO question_bank (id, course_id, chapter_id, knowledge_point_id, stem, options, answer, explanation, difficulty, source_label, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)").bind("qb_loop_5", "course_python", "chapter_3", "kp_range_count", "要让循环执行 5 次，下面哪种写法正确？", JSON.stringify(["range(4)", "range(5)", "range(6)", "range(1, 5)"]), "range(5)", "range(5) 产生 0 到 4，共 5 个数字。", "medium", "循环案例.pptx · 第 5 页", createdAt),
    db.prepare("INSERT OR IGNORE INTO question_bank (id, course_id, chapter_id, knowledge_point_id, stem, options, answer, explanation, difficulty, source_label, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)").bind("qb_loop_6", "course_python", "chapter_3", "kp_loop_basics", "循环中使用 break 的作用是什么？", JSON.stringify(["跳过本次循环", "立即结束循环", "重新定义变量", "暂停程序等待输入"]), "立即结束循环", "break 会直接结束当前循环。", "hard", "课堂练习说明.docx · 第 2 页", createdAt),
    db.prepare("INSERT OR IGNORE INTO learning_tasks (id, class_id, chapter_id, task_type, title, description, start_at, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("task_preview_1", "class_python", "chapter_3", "preview", "预习：循环结构", "阅读循环结构讲义，写下一个你见过的循环例子。", createdAt, "2026-09-10T23:59", "published", createdAt),
    db.prepare("INSERT OR IGNORE INTO learning_tasks (id, class_id, chapter_id, task_type, title, description, start_at, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("task_review_1", "class_python", "chapter_2", "review", "复习：条件判断", "回顾 if / elif / else，并完成课后复习清单。", "2026-09-11T00:00", "2026-09-20T23:59", "published", createdAt),
  ]);
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function timestamp() {
  return now();
}
