const STRATEGY_ID = "dense-sequential-v1";

function applyQueuePositionStrategy(items) {
    return Array.isArray(items)
        ? items.map((item, index) => ({
            ...item,
            queuePosition: index + 1
        }))
        : [];
}

function reorderQueueItems(items, itemId, action) {
    const list = Array.isArray(items) ? [...items] : [];
    const currentIndex = list.findIndex(item => item && item.id === itemId);
    if (currentIndex < 0) {
        return list;
    }

    const [moving] = list.splice(currentIndex, 1);
    let nextIndex = currentIndex;

    switch (String(action || "").toLowerCase()) {
        case "front":
            nextIndex = 0;
            break;
        case "back":
            nextIndex = list.length;
            break;
        case "up":
            nextIndex = Math.max(0, currentIndex - 1);
            break;
        case "down":
            nextIndex = Math.min(list.length, currentIndex + 1);
            break;
        default:
            list.splice(currentIndex, 0, moving);
            return list;
    }

    list.splice(nextIndex, 0, moving);
    return list;
}

module.exports = {
    STRATEGY_ID,
    applyQueuePositionStrategy,
    reorderQueueItems
};
