function createShippingRepository({ run, get, all }) {
    return {
        async getAll(limit = 500) {
            return all("SELECT * FROM shipments ORDER BY created_at DESC LIMIT ?", [limit]);
        },
        
        async getByUser(userId, limit = 500) {
            return all("SELECT * FROM shipments WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", [userId, limit]);
        },
        
        async getByOrder(orderId) {
            return get("SELECT * FROM shipments WHERE order_id = ?", [orderId]);
        },
        
        async getById(id) {
            return get("SELECT * FROM shipments WHERE id = ?", [id]);
        },
        
        async insert(shipment) {
            return run(
                "INSERT INTO shipments (id, order_id, user_id, recipient_name, address, city, tracking_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'PREPARING', ?, ?)",
                [shipment.id, shipment.orderId, shipment.userId, shipment.recipientName, shipment.address, shipment.city, shipment.trackingNumber, shipment.now, shipment.now]
            );
        },

        async updateUserIdIfMissing(id, userId) {
            return run("UPDATE shipments SET user_id = ? WHERE id = ? AND user_id IS NULL", [userId, id]).catch(() => {});
        },

        async compareAndSetStatus(id, newStatus, expectedPrevStatus, now) {
            return run(
                "UPDATE shipments SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
                [newStatus, now, id, expectedPrevStatus]
            );
        }
    };
}

module.exports = { createShippingRepository };