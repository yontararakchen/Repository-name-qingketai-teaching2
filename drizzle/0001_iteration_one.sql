CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('teacher', 'student')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS class_members (class_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('teacher', 'student')), joined_at TEXT NOT NULL, PRIMARY KEY (class_id, user_id), FOREIGN KEY (class_id) REFERENCES classes(id), FOREIGN KEY (user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_class_members_user_id ON class_members(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
