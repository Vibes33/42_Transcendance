CREATE TABLE `daily` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`mode` text NOT NULL,
	`session_id` text,
	`games` text NOT NULL,
	`status` text NOT NULL,
	`device_id` text,
	`started_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`)
);
--> statement-breakpoint
CREATE INDEX `daily_device` ON `daily` (`device_id`,`day`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`day` text NOT NULL,
	`game` text NOT NULL,
	`context` text NOT NULL,
	`session_id` text,
	`state` text NOT NULL,
	`started_at` integer NOT NULL,
	`over` integer DEFAULT false NOT NULL,
	`result` text,
	`base_points` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `rounds_user_day` ON `rounds` (`user_id`,`day`,`context`);--> statement-breakpoint
CREATE TABLE `seen` (
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`content_key` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `game`, `content_key`)
);
