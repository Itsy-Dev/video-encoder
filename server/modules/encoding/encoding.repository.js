class EncodingRepository {
    constructor(executor) {
        this.database = executor;
    }

    withExecutor(executor) {
        return new EncodingRepository(executor);
    }

    withTransaction(callback) {
        if (!this.database || typeof this.database.withTransaction !== "function") {
            throw new Error("EncodingRepository.withTransaction requires a transactional database executor");
        }

        return this.database.withTransaction(executor => callback(this.withExecutor(executor), executor));
    }

    async getNextQueued() {
        const { results } = await this.database.query(`
            SELECT
                ei.*,
                sm.abs_path AS source_abs_path,
                sm.file_size_bytes AS source_file_size_bytes,
                sm.duration_ms AS source_duration_ms,
                sm.container AS source_container,
                sm.video_codec AS source_video_codec,
                sm.audio_codec AS source_audio_codec,
                sm.width AS source_width,
                sm.height AS source_height,
                sm.frame_rate AS source_frame_rate,
                sm.bit_rate AS source_bit_rate,
                sm.probe_json AS source_probe_json,
                sm.probed_at AS source_probed_at,
                em.abs_path AS encoded_abs_path,
                em.file_size_bytes AS encoded_file_size_bytes,
                em.duration_ms AS encoded_duration_ms,
                em.container AS encoded_container,
                em.video_codec AS encoded_video_codec,
                em.audio_codec AS encoded_audio_codec,
                em.width AS encoded_width,
                em.height AS encoded_height,
                em.frame_rate AS encoded_frame_rate,
                em.bit_rate AS encoded_bit_rate,
                em.probe_json AS encoded_probe_json,
                em.probed_at AS encoded_probed_at
            FROM encoding_item ei
            LEFT JOIN encoding_item_metadata sm
                ON sm.encoding_item_id = ei.id AND sm.kind = 'source'
            LEFT JOIN encoding_item_metadata em
                ON em.encoding_item_id = ei.id AND em.kind = 'encoded'
            WHERE ei.status = 'queued'
            ORDER BY
                CASE WHEN ei.queue_position IS NULL THEN 1 ELSE 0 END ASC,
                ei.queue_position ASC,
                ei.queued_at ASC,
                ei.updated_at ASC
            LIMIT 1
        `);

        return Array.isArray(results) && results.length ? mapRowToItem(results[0]) : null;
    }

    async failInterrupted(message) {
        const interruptedStates = ["encoding", "paused"];
        const placeholders = interruptedStates.map(() => "?").join(", ");
        const now = new Date().toISOString();

        const { results } = await this.database.query(`
            UPDATE encoding_item
            SET
                status = 'failed',
                last_error = ?,
                updated_at = ?,
                completed_at = COALESCE(completed_at, ?)
            WHERE status IN (${placeholders})
        `, [
            message,
            toSqlDatetime(now),
            toSqlDatetime(now),
            ...interruptedStates
        ]);

        return {
            count: Number(results && typeof results.affectedRows === "number" ? results.affectedRows : 0)
        };
    }

    async requeueInterrupted(message) {
        const interruptedStates = ["encoding", "paused"];
        const placeholders = interruptedStates.map(() => "?").join(", ");
        const now = new Date().toISOString();

        const { results } = await this.database.query(`
            UPDATE encoding_item
            SET
                status = 'queued',
                last_error = ?,
                queued_at = COALESCE(queued_at, ?),
                queue_position = NULL,
                encoding_started_at = NULL,
                paused_at = NULL,
                completed_at = NULL,
                updated_at = ?
            WHERE status IN (${placeholders})
        `, [
            message,
            toSqlDatetime(now),
            toSqlDatetime(now),
            ...interruptedStates
        ]);

        return {
            count: Number(results && typeof results.affectedRows === "number" ? results.affectedRows : 0)
        };
    }

    async list() {
        const { results } = await this.database.query(`
            SELECT
                ei.*,
                sm.abs_path AS source_abs_path,
                sm.file_size_bytes AS source_file_size_bytes,
                sm.duration_ms AS source_duration_ms,
                sm.container AS source_container,
                sm.video_codec AS source_video_codec,
                sm.audio_codec AS source_audio_codec,
                sm.width AS source_width,
                sm.height AS source_height,
                sm.frame_rate AS source_frame_rate,
                sm.bit_rate AS source_bit_rate,
                sm.probe_json AS source_probe_json,
                sm.probed_at AS source_probed_at,
                em.abs_path AS encoded_abs_path,
                em.file_size_bytes AS encoded_file_size_bytes,
                em.duration_ms AS encoded_duration_ms,
                em.container AS encoded_container,
                em.video_codec AS encoded_video_codec,
                em.audio_codec AS encoded_audio_codec,
                em.width AS encoded_width,
                em.height AS encoded_height,
                em.frame_rate AS encoded_frame_rate,
                em.bit_rate AS encoded_bit_rate,
                em.probe_json AS encoded_probe_json,
                em.probed_at AS encoded_probed_at
            FROM encoding_item ei
            LEFT JOIN encoding_item_metadata sm
                ON sm.encoding_item_id = ei.id AND sm.kind = 'source'
            LEFT JOIN encoding_item_metadata em
                ON em.encoding_item_id = ei.id AND em.kind = 'encoded'
            ORDER BY ei.updated_at DESC
        `);

        return Array.isArray(results) ? results.map(mapRowToItem) : [];
    }

    async get(id) {
        const { results } = await this.database.query(`
            SELECT
                ei.*,
                sm.abs_path AS source_abs_path,
                sm.file_size_bytes AS source_file_size_bytes,
                sm.duration_ms AS source_duration_ms,
                sm.container AS source_container,
                sm.video_codec AS source_video_codec,
                sm.audio_codec AS source_audio_codec,
                sm.width AS source_width,
                sm.height AS source_height,
                sm.frame_rate AS source_frame_rate,
                sm.bit_rate AS source_bit_rate,
                sm.probe_json AS source_probe_json,
                sm.probed_at AS source_probed_at,
                em.abs_path AS encoded_abs_path,
                em.file_size_bytes AS encoded_file_size_bytes,
                em.duration_ms AS encoded_duration_ms,
                em.container AS encoded_container,
                em.video_codec AS encoded_video_codec,
                em.audio_codec AS encoded_audio_codec,
                em.width AS encoded_width,
                em.height AS encoded_height,
                em.frame_rate AS encoded_frame_rate,
                em.bit_rate AS encoded_bit_rate,
                em.probe_json AS encoded_probe_json,
                em.probed_at AS encoded_probed_at
            FROM encoding_item ei
            LEFT JOIN encoding_item_metadata sm
                ON sm.encoding_item_id = ei.id AND sm.kind = 'source'
            LEFT JOIN encoding_item_metadata em
                ON em.encoding_item_id = ei.id AND em.kind = 'encoded'
            WHERE ei.id = ?
            LIMIT 1
        `, [id]);

        return Array.isArray(results) && results.length ? mapRowToItem(results[0]) : null;
    }

    async getByInputAbsPath(inputAbsPath) {
        const { results } = await this.database.query(`
            SELECT
                ei.*,
                sm.abs_path AS source_abs_path,
                sm.file_size_bytes AS source_file_size_bytes,
                sm.duration_ms AS source_duration_ms,
                sm.container AS source_container,
                sm.video_codec AS source_video_codec,
                sm.audio_codec AS source_audio_codec,
                sm.width AS source_width,
                sm.height AS source_height,
                sm.frame_rate AS source_frame_rate,
                sm.bit_rate AS source_bit_rate,
                sm.probe_json AS source_probe_json,
                sm.probed_at AS source_probed_at,
                em.abs_path AS encoded_abs_path,
                em.file_size_bytes AS encoded_file_size_bytes,
                em.duration_ms AS encoded_duration_ms,
                em.container AS encoded_container,
                em.video_codec AS encoded_video_codec,
                em.audio_codec AS encoded_audio_codec,
                em.width AS encoded_width,
                em.height AS encoded_height,
                em.frame_rate AS encoded_frame_rate,
                em.bit_rate AS encoded_bit_rate,
                em.probe_json AS encoded_probe_json,
                em.probed_at AS encoded_probed_at
            FROM encoding_item ei
            LEFT JOIN encoding_item_metadata sm
                ON sm.encoding_item_id = ei.id AND sm.kind = 'source'
            LEFT JOIN encoding_item_metadata em
                ON em.encoding_item_id = ei.id AND em.kind = 'encoded'
            WHERE ei.input_abs_path = ?
            LIMIT 1
        `, [String(inputAbsPath || "")]);

        return Array.isArray(results) && results.length ? mapRowToItem(results[0]) : null;
    }

    async listQueuedOrdered({ forUpdate = false } = {}) {
        const { results } = await this.database.query(`
            SELECT
                ei.*,
                sm.abs_path AS source_abs_path,
                sm.file_size_bytes AS source_file_size_bytes,
                sm.duration_ms AS source_duration_ms,
                sm.container AS source_container,
                sm.video_codec AS source_video_codec,
                sm.audio_codec AS source_audio_codec,
                sm.width AS source_width,
                sm.height AS source_height,
                sm.frame_rate AS source_frame_rate,
                sm.bit_rate AS source_bit_rate,
                sm.probe_json AS source_probe_json,
                sm.probed_at AS source_probed_at,
                em.abs_path AS encoded_abs_path,
                em.file_size_bytes AS encoded_file_size_bytes,
                em.duration_ms AS encoded_duration_ms,
                em.container AS encoded_container,
                em.video_codec AS encoded_video_codec,
                em.audio_codec AS encoded_audio_codec,
                em.width AS encoded_width,
                em.height AS encoded_height,
                em.frame_rate AS encoded_frame_rate,
                em.bit_rate AS encoded_bit_rate,
                em.probe_json AS encoded_probe_json,
                em.probed_at AS encoded_probed_at
            FROM encoding_item ei
            LEFT JOIN encoding_item_metadata sm
                ON sm.encoding_item_id = ei.id AND sm.kind = 'source'
            LEFT JOIN encoding_item_metadata em
                ON em.encoding_item_id = ei.id AND em.kind = 'encoded'
            WHERE ei.status = 'queued'
            ORDER BY
                CASE WHEN ei.queue_position IS NULL THEN 1 ELSE 0 END ASC,
                ei.queue_position ASC,
                ei.queued_at ASC,
                ei.updated_at ASC
        `);

        return Array.isArray(results) ? results.map(mapRowToItem) : [];
    }

    async replaceQueuePositions(items) {
        const ordered = Array.isArray(items) ? items : [];

        for (const item of ordered) {
            await this.database.query(`
                UPDATE encoding_item
                SET
                    queue_position = ?,
                    updated_at = updated_at
                WHERE id = ?
            `, [
                numberOrNull(item && item.queuePosition),
                item && item.id
            ]);
        }
    }

    async upsert(item) {
        const next = {
            ...item,
            updatedAt: item.updatedAt || new Date().toISOString()
        };

        await this.database.query(`
            INSERT INTO encoding_item (
                id,
                status,
                original_filename,
                input_abs_path,
                inbox_relative_dir,
                profile_id,
                output_filename,
                output_abs_path,
                last_error,
                attempt_count,
                requested_at,
                queued_at,
                queue_position,
                encoding_started_at,
                paused_at,
                completed_at,
                approved_at,
                rejected_at,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                original_filename = excluded.original_filename,
                input_abs_path = excluded.input_abs_path,
                inbox_relative_dir = excluded.inbox_relative_dir,
                profile_id = excluded.profile_id,
                output_filename = excluded.output_filename,
                output_abs_path = excluded.output_abs_path,
                last_error = excluded.last_error,
                attempt_count = excluded.attempt_count,
                requested_at = excluded.requested_at,
                queued_at = excluded.queued_at,
                queue_position = excluded.queue_position,
                encoding_started_at = excluded.encoding_started_at,
                paused_at = excluded.paused_at,
                completed_at = excluded.completed_at,
                approved_at = excluded.approved_at,
                rejected_at = excluded.rejected_at,
                updated_at = excluded.updated_at
        `, [
            next.id,
            next.status || "pending",
            next.originalFilename || "",
            next.inputAbsPath || "",
            next.inboxRelativeDir || "",
            next.profileId || null,
            next.outputFilename || null,
            next.outputAbsPath || null,
            next.lastError || null,
            Number(next.attemptCount || 0),
            toSqlDatetime(next.requestedAt),
            toSqlDatetime(next.queuedAt),
            numberOrNull(next.queuePosition),
            toSqlDatetime(next.encodingStartedAt),
            toSqlDatetime(next.pausedAt),
            toSqlDatetime(next.completedAt),
            toSqlDatetime(next.approvedAt),
            toSqlDatetime(next.rejectedAt),
            toSqlDatetime(next.createdAt) || toSqlDatetime(new Date().toISOString()),
            toSqlDatetime(next.updatedAt) || toSqlDatetime(new Date().toISOString())
        ]);

        if (next.sourceMetadata) {
            await this.upsertMetadata(next.id, "source", next.sourceMetadata);
        }
        if (next.encodedMetadata) {
            await this.upsertMetadata(next.id, "encoded", next.encodedMetadata);
        }

        return this.get(next.id);
    }

    async upsertMetadata(encodingItemId, kind, metadata = {}) {
        await this.database.query(`
            INSERT INTO encoding_item_metadata (
                encoding_item_id,
                kind,
                abs_path,
                file_size_bytes,
                duration_ms,
                container,
                video_codec,
                audio_codec,
                width,
                height,
                frame_rate,
                bit_rate,
                probe_json,
                probed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(encoding_item_id, kind) DO UPDATE SET
                abs_path = excluded.abs_path,
                file_size_bytes = excluded.file_size_bytes,
                duration_ms = excluded.duration_ms,
                container = excluded.container,
                video_codec = excluded.video_codec,
                audio_codec = excluded.audio_codec,
                width = excluded.width,
                height = excluded.height,
                frame_rate = excluded.frame_rate,
                bit_rate = excluded.bit_rate,
                probe_json = excluded.probe_json,
                probed_at = excluded.probed_at,
                updated_at = CURRENT_TIMESTAMP
        `, [
            encodingItemId,
            kind,
            metadata.absPath || "",
            numberOrNull(metadata.fileSizeBytes),
            numberOrNull(metadata.durationMs),
            metadata.container || null,
            metadata.videoCodec || null,
            metadata.audioCodec || null,
            numberOrNull(metadata.width),
            numberOrNull(metadata.height),
            decimalOrNull(metadata.frameRate),
            numberOrNull(metadata.bitRate),
            metadata.probeJson == null ? null : JSON.stringify(metadata.probeJson),
            toSqlDatetime(metadata.probedAt)
        ]);
    }

    async deleteMetadata(encodingItemId, kind) {
        await this.database.query(`
            DELETE FROM encoding_item_metadata
            WHERE encoding_item_id = ? AND kind = ?
        `, [
            String(encodingItemId || ""),
            String(kind || "")
        ]);
    }

    async upsertOutcome(outcome) {
        const next = outcome || {};
        const source = next.sourceMetadata || {};
        const output = next.outputMetadata || {};

        await this.database.query(`
            INSERT INTO encoding_outcome (
                encoding_item_id,
                attempt_number,
                profile_id,
                requested_at,
                queued_at,
                encoding_started_at,
                encoding_finished_at,
                active_encoding_ms,
                paused_ms,
                wall_clock_ms,
                source_duration_ms,
                source_file_size_bytes,
                source_width,
                source_height,
                source_frame_rate,
                source_bit_rate,
                source_video_codec,
                source_audio_codec,
                source_container,
                source_probe_json,
                output_file_size_bytes,
                output_duration_ms,
                output_width,
                output_height,
                output_frame_rate,
                output_bit_rate,
                output_video_codec,
                output_audio_codec,
                output_container,
                output_probe_json,
                size_delta_bytes,
                size_delta_percent,
                bitrate_delta_bps,
                bitrate_delta_percent,
                output_abs_path,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(encoding_item_id, attempt_number) DO UPDATE SET
                profile_id = excluded.profile_id,
                requested_at = excluded.requested_at,
                queued_at = excluded.queued_at,
                encoding_started_at = excluded.encoding_started_at,
                encoding_finished_at = excluded.encoding_finished_at,
                active_encoding_ms = excluded.active_encoding_ms,
                paused_ms = excluded.paused_ms,
                wall_clock_ms = excluded.wall_clock_ms,
                source_duration_ms = excluded.source_duration_ms,
                source_file_size_bytes = excluded.source_file_size_bytes,
                source_width = excluded.source_width,
                source_height = excluded.source_height,
                source_frame_rate = excluded.source_frame_rate,
                source_bit_rate = excluded.source_bit_rate,
                source_video_codec = excluded.source_video_codec,
                source_audio_codec = excluded.source_audio_codec,
                source_container = excluded.source_container,
                source_probe_json = excluded.source_probe_json,
                output_file_size_bytes = excluded.output_file_size_bytes,
                output_duration_ms = excluded.output_duration_ms,
                output_width = excluded.output_width,
                output_height = excluded.output_height,
                output_frame_rate = excluded.output_frame_rate,
                output_bit_rate = excluded.output_bit_rate,
                output_video_codec = excluded.output_video_codec,
                output_audio_codec = excluded.output_audio_codec,
                output_container = excluded.output_container,
                output_probe_json = excluded.output_probe_json,
                size_delta_bytes = excluded.size_delta_bytes,
                size_delta_percent = excluded.size_delta_percent,
                bitrate_delta_bps = excluded.bitrate_delta_bps,
                bitrate_delta_percent = excluded.bitrate_delta_percent,
                output_abs_path = excluded.output_abs_path
        `, [
            next.encodingItemId || "",
            Number(next.attemptNumber || 0),
            next.profileId || "",
            toSqlDatetime(next.requestedAt),
            toSqlDatetime(next.queuedAt),
            toSqlDatetime(next.encodingStartedAt),
            toSqlDatetime(next.encodingFinishedAt),
            numberOrNull(next.activeEncodingMs),
            numberOrNull(next.pausedMs),
            numberOrNull(next.wallClockMs),
            numberOrNull(source.durationMs),
            numberOrNull(source.fileSizeBytes),
            numberOrNull(source.width),
            numberOrNull(source.height),
            decimalOrNull(source.frameRate),
            numberOrNull(source.bitRate),
            source.videoCodec || null,
            source.audioCodec || null,
            source.container || null,
            source.probeJson == null ? null : JSON.stringify(source.probeJson),
            numberOrNull(output.fileSizeBytes),
            numberOrNull(output.durationMs),
            numberOrNull(output.width),
            numberOrNull(output.height),
            decimalOrNull(output.frameRate),
            numberOrNull(output.bitRate),
            output.videoCodec || null,
            output.audioCodec || null,
            output.container || null,
            output.probeJson == null ? null : JSON.stringify(output.probeJson),
            numberOrNull(next.sizeDeltaBytes),
            decimalOrNull(next.sizeDeltaPercent),
            numberOrNull(next.bitrateDeltaBps),
            decimalOrNull(next.bitrateDeltaPercent),
            next.outputAbsPath || null,
            toSqlDatetime(next.createdAt) || toSqlDatetime(new Date().toISOString())
        ]);

        return this.getLatestOutcomeForItem(next.encodingItemId);
    }

    async getLatestOutcomeForItem(encodingItemId) {
        const { results } = await this.database.query(`
            SELECT *
            FROM encoding_outcome
            WHERE encoding_item_id = ?
            ORDER BY attempt_number DESC, created_at DESC, id DESC
            LIMIT 1
        `, [String(encodingItemId || "")]);

        return Array.isArray(results) && results.length ? mapRowToOutcome(results[0]) : null;
    }

    async listOutcomesWithItems() {
        const { results } = await this.database.query(`
            SELECT
                eo.*,
                ei.id AS item_id,
                ei.status AS item_status,
                ei.original_filename AS item_original_filename,
                ei.input_abs_path AS item_input_abs_path,
                ei.inbox_relative_dir AS item_inbox_relative_dir,
                ei.output_filename AS item_output_filename,
                ei.output_abs_path AS item_output_abs_path,
                ei.last_error AS item_last_error,
                ei.attempt_count AS item_attempt_count,
                ei.completed_at AS item_completed_at,
                ei.approved_at AS item_approved_at,
                ei.rejected_at AS item_rejected_at,
                ei.updated_at AS item_updated_at
            FROM encoding_outcome eo
            INNER JOIN encoding_item ei
                ON ei.id = eo.encoding_item_id
            ORDER BY eo.created_at DESC, eo.attempt_number DESC, eo.id DESC
        `);

        return Array.isArray(results) ? results.map(mapRowToHistoryOutcome) : [];
    }
}

function mapRowToItem(row) {
    return {
        id: row.id,
        status: row.status,
        originalFilename: row.original_filename,
        inputAbsPath: row.input_abs_path,
        inboxRelativeDir: row.inbox_relative_dir,
        profileId: row.profile_id,
        outputFilename: row.output_filename,
        outputAbsPath: row.output_abs_path,
        lastError: row.last_error,
        attemptCount: Number(row.attempt_count || 0),
        requestedAt: toIsoOrNull(row.requested_at),
        queuedAt: toIsoOrNull(row.queued_at),
        queuePosition: numberOrNull(row.queue_position),
        encodingStartedAt: toIsoOrNull(row.encoding_started_at),
        pausedAt: toIsoOrNull(row.paused_at),
        completedAt: toIsoOrNull(row.completed_at),
        approvedAt: toIsoOrNull(row.approved_at),
        rejectedAt: toIsoOrNull(row.rejected_at),
        createdAt: toIsoOrNull(row.created_at),
        updatedAt: toIsoOrNull(row.updated_at),
        sourceMetadata: buildMetadata(row, "source"),
        encodedMetadata: buildMetadata(row, "encoded")
    };
}

function buildMetadata(row, prefix) {
    const absPath = row[`${prefix}_abs_path`] || row[`${prefix}_input_abs_path`] || row[`${prefix}_output_abs_path`] || null;
    const probedAt = toIsoOrNull(row[`${prefix}_probed_at`]);
    const hasAnyValue = [
        row[`${prefix}_file_size_bytes`],
        row[`${prefix}_duration_ms`],
        row[`${prefix}_container`],
        row[`${prefix}_video_codec`],
        row[`${prefix}_audio_codec`],
        row[`${prefix}_width`],
        row[`${prefix}_height`],
        row[`${prefix}_frame_rate`],
        row[`${prefix}_bit_rate`],
        row[`${prefix}_probe_json`],
        probedAt,
        absPath
    ].some(value => value != null);

    if (!hasAnyValue) return null;

    return {
        absPath,
        fileSizeBytes: numberOrNull(row[`${prefix}_file_size_bytes`]),
        durationMs: numberOrNull(row[`${prefix}_duration_ms`]),
        container: row[`${prefix}_container`] || null,
        videoCodec: row[`${prefix}_video_codec`] || null,
        audioCodec: row[`${prefix}_audio_codec`] || null,
        width: numberOrNull(row[`${prefix}_width`]),
        height: numberOrNull(row[`${prefix}_height`]),
        frameRate: decimalOrNull(row[`${prefix}_frame_rate`]),
        bitRate: numberOrNull(row[`${prefix}_bit_rate`]),
        probeJson: parseJsonOrNull(row[`${prefix}_probe_json`]),
        probedAt
    };
}

function mapRowToOutcome(row) {
    return {
        id: numberOrNull(row.id),
        encodingItemId: row.encoding_item_id,
        attemptNumber: Number(row.attempt_number || 0),
        profileId: row.profile_id || null,
        requestedAt: toIsoOrNull(row.requested_at),
        queuedAt: toIsoOrNull(row.queued_at),
        encodingStartedAt: toIsoOrNull(row.encoding_started_at),
        encodingFinishedAt: toIsoOrNull(row.encoding_finished_at),
        activeEncodingMs: numberOrNull(row.active_encoding_ms),
        pausedMs: numberOrNull(row.paused_ms),
        wallClockMs: numberOrNull(row.wall_clock_ms),
        outputAbsPath: row.output_abs_path || null,
        sizeDeltaBytes: numberOrNull(row.size_delta_bytes),
        sizeDeltaPercent: decimalOrNull(row.size_delta_percent),
        bitrateDeltaBps: numberOrNull(row.bitrate_delta_bps),
        bitrateDeltaPercent: decimalOrNull(row.bitrate_delta_percent),
        sourceMetadata: {
            durationMs: numberOrNull(row.source_duration_ms),
            fileSizeBytes: numberOrNull(row.source_file_size_bytes),
            width: numberOrNull(row.source_width),
            height: numberOrNull(row.source_height),
            frameRate: decimalOrNull(row.source_frame_rate),
            bitRate: numberOrNull(row.source_bit_rate),
            videoCodec: row.source_video_codec || null,
            audioCodec: row.source_audio_codec || null,
            container: row.source_container || null,
            probeJson: parseJsonOrNull(row.source_probe_json)
        },
        outputMetadata: {
            durationMs: numberOrNull(row.output_duration_ms),
            fileSizeBytes: numberOrNull(row.output_file_size_bytes),
            width: numberOrNull(row.output_width),
            height: numberOrNull(row.output_height),
            frameRate: decimalOrNull(row.output_frame_rate),
            bitRate: numberOrNull(row.output_bit_rate),
            videoCodec: row.output_video_codec || null,
            audioCodec: row.output_audio_codec || null,
            container: row.output_container || null,
            probeJson: parseJsonOrNull(row.output_probe_json)
        },
        createdAt: toIsoOrNull(row.created_at)
    };
}

function mapRowToHistoryOutcome(row) {
    const attemptNumber = Number(row.attempt_number || 0);
    const currentAttemptCount = Number(row.item_attempt_count || 0);
    const currentStatus = String(row.item_status || "").toLowerCase();
    const isLatestAttempt = currentAttemptCount === attemptNumber;
    const status = isLatestAttempt && ["review", "approved", "rejected"].includes(currentStatus)
        ? currentStatus
        : "completed";

    return {
        id: `outcome:${row.id}`,
        historyRowType: "outcome",
        encodingItemId: row.encoding_item_id,
        attemptNumber,
        isLatestAttempt,
        status,
        originalFilename: row.item_original_filename || row.item_output_filename || null,
        inputAbsPath: row.item_input_abs_path || null,
        inboxRelativeDir: row.item_inbox_relative_dir || "",
        profileId: row.profile_id || null,
        outputFilename: row.item_output_filename || null,
        outputAbsPath: row.output_abs_path || row.item_output_abs_path || null,
        lastError: row.item_last_error || null,
        completedAt: toIsoOrNull(row.encoding_finished_at),
        approvedAt: toIsoOrNull(row.item_approved_at),
        rejectedAt: toIsoOrNull(row.item_rejected_at),
        updatedAt: toIsoOrNull(row.created_at),
        createdAt: toIsoOrNull(row.created_at),
        currentItemStatus: currentStatus || null,
        currentAttemptCount,
        sourceMetadata: {
            durationMs: numberOrNull(row.source_duration_ms),
            fileSizeBytes: numberOrNull(row.source_file_size_bytes),
            width: numberOrNull(row.source_width),
            height: numberOrNull(row.source_height),
            frameRate: decimalOrNull(row.source_frame_rate),
            bitRate: numberOrNull(row.source_bit_rate),
            videoCodec: row.source_video_codec || null,
            audioCodec: row.source_audio_codec || null,
            container: row.source_container || null,
            probeJson: parseJsonOrNull(row.source_probe_json)
        },
        outputMetadata: {
            durationMs: numberOrNull(row.output_duration_ms),
            fileSizeBytes: numberOrNull(row.output_file_size_bytes),
            width: numberOrNull(row.output_width),
            height: numberOrNull(row.output_height),
            frameRate: decimalOrNull(row.output_frame_rate),
            bitRate: numberOrNull(row.output_bit_rate),
            videoCodec: row.output_video_codec || null,
            audioCodec: row.output_audio_codec || null,
            container: row.output_container || null,
            probeJson: parseJsonOrNull(row.output_probe_json)
        }
    };
}

function toIsoOrNull(value) {
    if (!value) return null;
    const normalized = normalizeSqlDatetime(value);
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSqlDatetime(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }

    const text = String(value).trim();
    if (!text) {
        return text;
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
        return `${text.replace(" ", "T")}Z`;
    }

    return text;
}

function toSqlDatetime(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace("T", " ");
}

function parseJsonOrNull(value) {
    if (!value) return null;
    try {
        return typeof value === "string" ? JSON.parse(value) : value;
    }
    catch (_error) {
        return null;
    }
}

function numberOrNull(value) {
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
}

function decimalOrNull(value) {
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
}

module.exports = EncodingRepository;
