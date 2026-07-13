class EncodingRepository {
    constructor(database) {
        this.database = database;
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
                inbox_input_abs_path,
                input_abs_path,
                inbox_relative_path,
                inbox_relative_dir,
                profile_id,
                output_filename,
                encoded_output_abs_path,
                outbox_output_abs_path,
                last_error,
                attempt_count,
                requested_at,
                queued_at,
                encoding_started_at,
                paused_at,
                completed_at,
                approved_at,
                rejected_at,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                original_filename = VALUES(original_filename),
                inbox_input_abs_path = VALUES(inbox_input_abs_path),
                input_abs_path = VALUES(input_abs_path),
                inbox_relative_path = VALUES(inbox_relative_path),
                inbox_relative_dir = VALUES(inbox_relative_dir),
                profile_id = VALUES(profile_id),
                output_filename = VALUES(output_filename),
                encoded_output_abs_path = VALUES(encoded_output_abs_path),
                outbox_output_abs_path = VALUES(outbox_output_abs_path),
                last_error = VALUES(last_error),
                attempt_count = VALUES(attempt_count),
                requested_at = VALUES(requested_at),
                queued_at = VALUES(queued_at),
                encoding_started_at = VALUES(encoding_started_at),
                paused_at = VALUES(paused_at),
                completed_at = VALUES(completed_at),
                approved_at = VALUES(approved_at),
                rejected_at = VALUES(rejected_at),
                updated_at = VALUES(updated_at)
        `, [
            next.id,
            next.status || "pending",
            next.originalFilename || "",
            next.inboxInputAbsPath || "",
            next.inputAbsPath || "",
            next.inboxRelativePath || "",
            next.inboxRelativeDir || "",
            next.profileId || null,
            next.outputFilename || null,
            next.encodedOutputAbsPath || null,
            next.outboxOutputAbsPath || null,
            next.lastError || null,
            Number(next.attemptCount || 0),
            toSqlDatetime(next.requestedAt),
            toSqlDatetime(next.queuedAt),
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
            ON DUPLICATE KEY UPDATE
                abs_path = VALUES(abs_path),
                file_size_bytes = VALUES(file_size_bytes),
                duration_ms = VALUES(duration_ms),
                container = VALUES(container),
                video_codec = VALUES(video_codec),
                audio_codec = VALUES(audio_codec),
                width = VALUES(width),
                height = VALUES(height),
                frame_rate = VALUES(frame_rate),
                bit_rate = VALUES(bit_rate),
                probe_json = VALUES(probe_json),
                probed_at = VALUES(probed_at)
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
}

function mapRowToItem(row) {
    return {
        id: row.id,
        status: row.status,
        originalFilename: row.original_filename,
        inboxInputAbsPath: row.inbox_input_abs_path,
        inputAbsPath: row.input_abs_path,
        inboxRelativePath: row.inbox_relative_path,
        inboxRelativeDir: row.inbox_relative_dir,
        profileId: row.profile_id,
        outputFilename: row.output_filename,
        encodedOutputAbsPath: row.encoded_output_abs_path,
        outboxOutputAbsPath: row.outbox_output_abs_path,
        lastError: row.last_error,
        attemptCount: Number(row.attempt_count || 0),
        requestedAt: toIsoOrNull(row.requested_at),
        queuedAt: toIsoOrNull(row.queued_at),
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

function toIsoOrNull(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
