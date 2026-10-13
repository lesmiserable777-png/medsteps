CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);

CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`card_id` text,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);

CREATE TABLE `learning` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`date` text NOT NULL,
	`evidence` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);

CREATE TABLE `progress` (
	`scope` text NOT NULL,
	`card_id` text NOT NULL,
	`state` text NOT NULL,
	PRIMARY KEY(`scope`, `card_id`)
);

CREATE TABLE `sessions` (
	`scope` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL
);

CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`summary` text NOT NULL
);

CREATE TABLE `source_assets` (
	`key` text PRIMARY KEY NOT NULL,
	`base64` text NOT NULL,
	`content_type` text NOT NULL
);
