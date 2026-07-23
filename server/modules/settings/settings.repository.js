class SettingsRepository {
    constructor(executor) {
        this.database = executor;
    }

    withExecutor(executor) {
        return new SettingsRepository(executor);
    }

    withTransaction(callback) {
        if (!this.database || typeof this.database.withTransaction !== "function") {
            throw new Error("SettingsRepository.withTransaction requires a transactional database executor");
        }

        return this.database.withTransaction(executor => callback(this.withExecutor(executor), executor));
    }

    async list() {
        const { results } = await this.database.query(`
            SELECT
                setting_key,
                value_json,
                created_at,
                updated_at
            FROM app_setting
            ORDER BY setting_key ASC
        `);

        return Array.isArray(results) ? results.map(mapRowToSetting) : [];
    }

    async get(key) {
        const { results } = await this.database.query(`
            SELECT
                setting_key,
                value_json,
                created_at,
                updated_at
            FROM app_setting
            WHERE setting_key = ?
            LIMIT 1
        `, [String(key || "")]);

        return Array.isArray(results) && results.length ? mapRowToSetting(results[0]) : null;
    }

    async set(key, value) {
        const nextKey = String(key || "").trim();
        if (!nextKey) {
            throw new Error("SettingsRepository.set requires a non-empty key");
        }

        await this.database.query(`
            INSERT INTO app_setting (
                setting_key,
                value_json
            ) VALUES (?, ?)
            ON CONFLICT(setting_key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = CURRENT_TIMESTAMP
        `, [
            nextKey,
            serializeValue(value)
        ]);

        return this.get(nextKey);
    }

    async setMany(entries) {
        const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
        const saved = [];

        for (const entry of list) {
            saved.push(await this.set(entry.key, entry.value));
        }

        return saved;
    }

    async delete(key) {
        const nextKey = String(key || "").trim();
        if (!nextKey) {
            return { deleted: false };
        }

        const { results } = await this.database.query(`
            DELETE FROM app_setting
            WHERE setting_key = ?
        `, [nextKey]);

        return {
            deleted: Number(results && results.affectedRows || 0) > 0
        };
    }
}

function mapRowToSetting(row) {
    return {
        key: row.setting_key,
        value: parseJsonOrText(row.value_json),
        createdAt: toIsoOrNull(row.created_at),
        updatedAt: toIsoOrNull(row.updated_at)
    };
}

function serializeValue(value) {
    return JSON.stringify(value);
}

function parseJsonOrText(value) {
    if (value == null || value === "") {
        return null;
    }

    try {
        return JSON.parse(value);
    }
    catch (_error) {
        return value;
    }
}

function toIsoOrNull(value) {
    if (!value) return null;
    const date = new Date(normalizeSqlDatetime(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSqlDatetime(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }

    const text = String(value || "").trim();
    if (!text) {
        return text;
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
        return `${text.replace(" ", "T")}Z`;
    }

    return text;
}

module.exports = SettingsRepository;
