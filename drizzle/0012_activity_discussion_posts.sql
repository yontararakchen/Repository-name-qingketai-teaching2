CREATE TABLE IF NOT EXISTS activity_discussion_posts (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (activity_id) REFERENCES activities(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);
