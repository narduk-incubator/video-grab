-- Seed data for local development
-- Run: pnpm run db:seed (after db:migrate)

-- Example login password hash for 'testpass123' generated via the layer's
-- hashUserPassword() helper (PBKDF2-SHA256, 100k iterations).
INSERT INTO users (id, email, password_hash, name, is_admin, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'demo@example.com', '55b73944e7aabc084b75505077b7f315:4655b6188b3937d0c5d815df32797f19f49d7ff10b49b18abfdb5ef0fa4e1dbc', 'Demo User', 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('00000000-0000-0000-0000-000000000002', 'admin@example.com', '55b73944e7aabc084b75505077b7f315:4655b6188b3937d0c5d815df32797f19f49d7ff10b49b18abfdb5ef0fa4e1dbc', 'Admin User', 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
  ('00000000-0000-0000-0000-000000000003', 'admin@nard.uk', '55b73944e7aabc084b75505077b7f315:4655b6188b3937d0c5d815df32797f19f49d7ff10b49b18abfdb5ef0fa4e1dbc', 'Narduk Admin', 1, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  password_hash = excluded.password_hash,
  name = excluded.name,
  is_admin = excluded.is_admin,
  updated_at = excluded.updated_at;

INSERT OR IGNORE INTO todos (user_id, title, completed, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Set up local development', 1, '2025-01-01T00:00:00.000Z'),
  ('00000000-0000-0000-0000-000000000001', 'Run database migrations', 1, '2025-01-01T00:00:00.000Z'),
  ('00000000-0000-0000-0000-000000000001', 'Seed the database', 0, '2025-01-01T00:00:00.000Z'),
  ('00000000-0000-0000-0000-000000000002', 'Review admin dashboard', 0, '2025-01-01T00:00:00.000Z');

INSERT INTO notifications (id, user_id, kind, title, body, icon, action_url, is_read, created_at)
VALUES
  ('00000000-0000-0000-0000-notification1', '00000000-0000-0000-0000-000000000001', 'system', 'Welcome to the app!', 'Your account has been created. Explore the dashboard to get started.', 'i-lucide-party-popper', '/dashboard', 0, '2025-01-01T00:00:00.000Z'),
  ('00000000-0000-0000-0000-notification2', '00000000-0000-0000-0000-000000000001', 'reminder', 'Complete your profile', 'Add a display name and photo to personalize your account.', 'i-lucide-user-circle', '/settings', 0, '2025-01-02T00:00:00.000Z'),
  ('00000000-0000-0000-0000-notification3', '00000000-0000-0000-0000-000000000002', 'system', 'Admin access granted', 'You have been given admin privileges. Visit the admin panel to manage users.', 'i-lucide-shield-check', '/admin', 0, '2025-01-01T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  user_id = excluded.user_id,
  kind = excluded.kind,
  title = excluded.title,
  body = excluded.body,
  icon = excluded.icon,
  action_url = excluded.action_url,
  is_read = excluded.is_read,
  read_at = NULL,
  created_at = excluded.created_at;
