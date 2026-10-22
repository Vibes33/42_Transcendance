CREATE TABLE `community` (
	`streamer_id` text NOT NULL,
	`season` integer NOT NULL,
	`user_id` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`streamer_id`, `season`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `days` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`final_total` integer,
	PRIMARY KEY(`user_id`, `day`)
);
--> statement-breakpoint
CREATE INDEX `days_day` ON `days` (`day`);--> statement-breakpoint
CREATE TABLE `finalized_days` (
	`day` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`user_id` text NOT NULL,
	`item` text NOT NULL,
	`source` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item`)
);
--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`ref` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_once` ON `ledger` (`user_id`,`reason`,`ref`);--> statement-breakpoint
CREATE INDEX `ledger_user` ON `ledger` (`user_id`,`at`);--> statement-breakpoint
CREATE TABLE `paid_seasons` (
	`season` integer PRIMARY KEY NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `results` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`game` text NOT NULL,
	`kind` text NOT NULL,
	`result` text NOT NULL,
	`base_points` integer NOT NULL,
	`finished_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`, `game`)
);
--> statement-breakpoint
CREATE INDEX `results_day_game` ON `results` (`day`,`game`);--> statement-breakpoint
CREATE TABLE `season_points` (
	`user_id` text NOT NULL,
	`season` integer NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`days_played` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `season`)
);
--> statement-breakpoint
CREATE INDEX `season_rank` ON `season_points` (`season`,`points`);--> statement-breakpoint
CREATE TABLE `streaks` (
	`user_id` text PRIMARY KEY NOT NULL,
	`current` integer DEFAULT 0 NOT NULL,
	`best` integer DEFAULT 0 NOT NULL,
	`last_day` text
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weeks` (
	`user_id` text NOT NULL,
	`week` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `week`)
);
