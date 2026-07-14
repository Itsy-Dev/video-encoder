ALTER TABLE `encoding_item`
MODIFY COLUMN `status` ENUM('pending','queued','encoding','paused','review','exported','rejected','failed','cancelled','discarded')
NOT NULL DEFAULT 'pending';
