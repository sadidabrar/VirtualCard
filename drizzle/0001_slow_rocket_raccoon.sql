CREATE TABLE `vault_configs` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`kdf_salt` text NOT NULL,
	`encrypted_dek` text NOT NULL,
	`dek_iv` text NOT NULL,
	`dek_tag` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vault_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`original_size` integer NOT NULL,
	`compressed_size` integer NOT NULL,
	`file_iv` text NOT NULL,
	`file_tag` text NOT NULL,
	`meta_ciphertext` text NOT NULL,
	`meta_iv` text NOT NULL,
	`meta_tag` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vault_docs_user_id` ON `vault_documents` (`user_id`);--> statement-breakpoint
CREATE TABLE `vault_profiles` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`tag` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `cards` ADD `phones_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `maps_url` text DEFAULT '';--> statement-breakpoint
ALTER TABLE `cards` ADD `extra_socials_json` text DEFAULT '[]' NOT NULL;