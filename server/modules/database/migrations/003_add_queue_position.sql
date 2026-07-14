ALTER TABLE `encoding_item`
ADD COLUMN `queue_position` INT UNSIGNED DEFAULT NULL AFTER `queued_at`;

ALTER TABLE `encoding_item`
ADD KEY `idx_encoding_item_queue_order` (`status`, `queue_position`, `queued_at`);
