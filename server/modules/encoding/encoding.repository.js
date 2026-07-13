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

    findByRequestId(requestId) {
        for (const item of this.items.values()) {
            if (item.requestId === requestId) return item;
        }
        return null;
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
