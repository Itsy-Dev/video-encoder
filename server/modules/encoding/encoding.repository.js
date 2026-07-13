class EncodingRepository {
    constructor() {
        this.items = new Map();
    }

    list() {
        return Array.from(this.items.values())
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }

    get(id) {
        return this.items.get(id) || null;
    }

    upsert(item) {
        const current = this.items.get(item.id) || {};
        const next = {
            ...current,
            ...item,
            updatedAt: new Date().toISOString()
        };
        this.items.set(next.id, next);
        return next;
    }
}

module.exports = new EncodingRepository();
