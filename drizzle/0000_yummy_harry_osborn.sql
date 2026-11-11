CREATE TABLE `cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`job_title` text DEFAULT '',
	`company` text DEFAULT '',
	`tagline` text DEFAULT '',
	`phone` text DEFAULT '',
	`whatsapp` text DEFAULT '',
	`public_email` text DEFAULT '',
	`website` text DEFAULT '',
	`address` text DEFAULT '',
	`socials` text DEFAULT '{}',
	`avatar_url` text DEFAULT '',
	`logo_url` text DEFAULT '',
	`theme` text DEFAULT '#38bdf8' NOT NULL,
	`is_published` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_user_id_unique` ON `cards` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_cards_user_id` ON `cards` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_username` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);