CREATE INDEX IF NOT EXISTS `idx_encoding_item_queue_order`
ON `encoding_item` (`status`, `queue_position`, `queued_at`);
