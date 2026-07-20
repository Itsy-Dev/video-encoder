-- Ground-zero SQLite schema for the standalone app database.

CREATE TABLE IF NOT EXISTS `encoding_item` (
    `id` TEXT NOT NULL PRIMARY KEY,
    `status` TEXT NOT NULL DEFAULT 'pending',
    `original_filename` TEXT NOT NULL,
    `input_abs_path` TEXT NOT NULL,
    `inbox_relative_dir` TEXT NOT NULL DEFAULT '',
    `profile_id` TEXT DEFAULT NULL,
    `output_filename` TEXT DEFAULT NULL,
    `output_abs_path` TEXT DEFAULT NULL,
    `last_error` TEXT DEFAULT NULL,
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `requested_at` TEXT DEFAULT NULL,
    `queued_at` TEXT DEFAULT NULL,
    `queue_position` INTEGER DEFAULT NULL,
    `encoding_started_at` TEXT DEFAULT NULL,
    `paused_at` TEXT DEFAULT NULL,
    `completed_at` TEXT DEFAULT NULL,
    `approved_at` TEXT DEFAULT NULL,
    `rejected_at` TEXT DEFAULT NULL,
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS `idx_encoding_item_status`
ON `encoding_item` (`status`);

CREATE INDEX IF NOT EXISTS `idx_encoding_item_updated_at`
ON `encoding_item` (`updated_at`);

CREATE INDEX IF NOT EXISTS `idx_encoding_item_queue_order`
ON `encoding_item` (`status`, `queue_position`, `queued_at`);

CREATE TABLE IF NOT EXISTS `encoding_item_metadata` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `encoding_item_id` TEXT NOT NULL,
    `kind` TEXT NOT NULL,
    `abs_path` TEXT NOT NULL,
    `file_size_bytes` INTEGER DEFAULT NULL,
    `duration_ms` INTEGER DEFAULT NULL,
    `container` TEXT DEFAULT NULL,
    `video_codec` TEXT DEFAULT NULL,
    `audio_codec` TEXT DEFAULT NULL,
    `width` INTEGER DEFAULT NULL,
    `height` INTEGER DEFAULT NULL,
    `frame_rate` REAL DEFAULT NULL,
    `bit_rate` INTEGER DEFAULT NULL,
    `probe_json` TEXT DEFAULT NULL,
    `probed_at` TEXT DEFAULT NULL,
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (`encoding_item_id`, `kind`),
    FOREIGN KEY (`encoding_item_id`) REFERENCES `encoding_item` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `app_setting` (
    `setting_key` TEXT NOT NULL PRIMARY KEY,
    `value_json` TEXT NOT NULL,
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `encoding_outcome` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `encoding_item_id` TEXT NOT NULL,
    `attempt_number` INTEGER NOT NULL,
    `profile_id` TEXT NOT NULL,
    `requested_at` TEXT DEFAULT NULL,
    `queued_at` TEXT DEFAULT NULL,
    `encoding_started_at` TEXT DEFAULT NULL,
    `encoding_finished_at` TEXT DEFAULT NULL,
    `active_encoding_ms` INTEGER DEFAULT NULL,
    `paused_ms` INTEGER NOT NULL DEFAULT 0,
    `wall_clock_ms` INTEGER DEFAULT NULL,
    `source_duration_ms` INTEGER DEFAULT NULL,
    `source_file_size_bytes` INTEGER DEFAULT NULL,
    `source_width` INTEGER DEFAULT NULL,
    `source_height` INTEGER DEFAULT NULL,
    `source_frame_rate` REAL DEFAULT NULL,
    `source_bit_rate` INTEGER DEFAULT NULL,
    `source_video_codec` TEXT DEFAULT NULL,
    `source_audio_codec` TEXT DEFAULT NULL,
    `source_container` TEXT DEFAULT NULL,
    `source_probe_json` TEXT DEFAULT NULL,
    `output_file_size_bytes` INTEGER DEFAULT NULL,
    `output_duration_ms` INTEGER DEFAULT NULL,
    `output_width` INTEGER DEFAULT NULL,
    `output_height` INTEGER DEFAULT NULL,
    `output_frame_rate` REAL DEFAULT NULL,
    `output_bit_rate` INTEGER DEFAULT NULL,
    `output_video_codec` TEXT DEFAULT NULL,
    `output_audio_codec` TEXT DEFAULT NULL,
    `output_container` TEXT DEFAULT NULL,
    `output_probe_json` TEXT DEFAULT NULL,
    `size_delta_bytes` INTEGER DEFAULT NULL,
    `size_delta_percent` REAL DEFAULT NULL,
    `bitrate_delta_bps` INTEGER DEFAULT NULL,
    `bitrate_delta_percent` REAL DEFAULT NULL,
    `output_abs_path` TEXT DEFAULT NULL,
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (`encoding_item_id`, `attempt_number`),
    FOREIGN KEY (`encoding_item_id`) REFERENCES `encoding_item` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_encoding_outcome_item`
ON `encoding_outcome` (`encoding_item_id`);

CREATE INDEX IF NOT EXISTS `idx_encoding_outcome_profile`
ON `encoding_outcome` (`profile_id`);

CREATE INDEX IF NOT EXISTS `idx_encoding_outcome_created_at`
ON `encoding_outcome` (`created_at`);
