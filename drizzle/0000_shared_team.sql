CREATE TABLE `shared_team` (
  `id` text PRIMARY KEY NOT NULL,
  `revision` integer NOT NULL DEFAULT 0,
  `snapshot_key` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL
);
