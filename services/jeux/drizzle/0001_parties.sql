CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`game` text NOT NULL,
	`state` text NOT NULL,
	`over` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `parties_session` ON `parties` (`session_id`,`game`);