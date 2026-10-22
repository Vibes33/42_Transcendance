CREATE TABLE `blocks` (
	`blocker` text NOT NULL,
	`blocked` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`blocker`, `blocked`)
);
--> statement-breakpoint
CREATE TABLE `friend_requests` (
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`from_id`, `to_id`)
);
--> statement-breakpoint
CREATE INDEX `req_to` ON `friend_requests` (`to_id`);--> statement-breakpoint
CREATE TABLE `friendships` (
	`user_a` text NOT NULL,
	`user_b` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_a`, `user_b`)
);
--> statement-breakpoint
CREATE INDEX `friend_b` ON `friendships` (`user_b`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`invited_by` text,
	`at` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gm_user` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`leader` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter` text NOT NULL,
	`reported` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
