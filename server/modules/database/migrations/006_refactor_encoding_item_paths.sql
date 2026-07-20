ALTER TABLE `encoding_item`
    CHANGE COLUMN `outbox_output_abs_path` `output_abs_path` TEXT DEFAULT NULL,
    DROP COLUMN `inbox_input_abs_path`,
    DROP COLUMN `encoded_output_abs_path`,
    DROP COLUMN `inbox_relative_path`;

ALTER TABLE `encoding_outcome`
    CHANGE COLUMN `encoded_output_abs_path` `output_abs_path` TEXT DEFAULT NULL;
