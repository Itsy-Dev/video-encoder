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
