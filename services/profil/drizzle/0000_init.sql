CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`pseudo` text,
	`pseudo_lower` text,
	`tag` text,
	`role` text,
	`names_lang` text DEFAULT 'fr' NOT NULL,
	`site_lang` text DEFAULT 'fr' NOT NULL,
	`reminder` integer DEFAULT true NOT NULL,
	`mode` text DEFAULT 'sombre' NOT NULL,
	`chibi` text DEFAULT 'random' NOT NULL,
	`skin` text,
	`starter` text,
	`onboarded` integer DEFAULT false NOT NULL,
	`tutorials` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_pseudo_lower_unique` ON `profiles` (`pseudo_lower`);