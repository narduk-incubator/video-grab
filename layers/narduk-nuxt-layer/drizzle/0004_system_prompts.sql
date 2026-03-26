-- System prompts table for app-configurable AI prompt content.

CREATE TABLE IF NOT EXISTS `system_prompts` (
  `name` text PRIMARY KEY NOT NULL,
  `content` text NOT NULL,
  `description` text NOT NULL,
  `updated_at` text NOT NULL
);
