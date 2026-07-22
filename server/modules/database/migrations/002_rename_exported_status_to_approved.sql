UPDATE `encoding_item`
SET
    `status` = 'approved',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `status` = 'exported';
