CREATE TABLE IF NOT EXISTS question_bank (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  chapter_id TEXT,
  knowledge_point_id TEXT,
  stem TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',
  answer TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  source_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id),
  FOREIGN KEY (chapter_id) REFERENCES chapters(id),
  FOREIGN KEY (knowledge_point_id) REFERENCES knowledge_points(id)
);
CREATE TABLE IF NOT EXISTS personalized_assignments (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  chapter_id TEXT,
  student_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  question_ids TEXT NOT NULL DEFAULT '[]',
  question_payload TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (chapter_id) REFERENCES chapters(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_question_bank_chapter ON question_bank(chapter_id, status);
CREATE INDEX IF NOT EXISTS idx_personalized_assignments_student ON personalized_assignments(class_id, student_id, status, updated_at);
CREATE TABLE IF NOT EXISTS personalized_responses (
  id TEXT PRIMARY KEY,
  personalized_assignment_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (personalized_assignment_id, student_id),
  FOREIGN KEY (personalized_assignment_id) REFERENCES personalized_assignments(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE INDEX IF NOT EXISTS idx_personalized_responses_assignment ON personalized_responses(personalized_assignment_id, student_id);
