// Accès aux données : le seul fichier qui contient du SQL.
function createOrderRepository(db) {
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, user_id, customer_name, customer_address, customer_city, total, status, created_at)
    VALUES (@id, @userId, @name, @address, @city, @total, @status, @createdAt)`);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, name, price, quantity)
    VALUES (@orderId, @productId, @name, @price, @quantity)`);
  const selectOrder = db.prepare(`SELECT * FROM orders WHERE id = ?`);
  const selectByUser = db.prepare(`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`);
  const selectItems = db.prepare(`SELECT product_id, name, price, quantity FROM order_items WHERE order_id = ? ORDER BY id`);
  const updateStatus = db.prepare(`UPDATE orders SET status = ? WHERE id = ?`);
  const updateStatusIf = db.prepare(`UPDATE orders SET status = @next WHERE id = @id AND status = @expected`);

  const toApi = (row) => ({
    id: row.id,
    userId: row.user_id,
    customer: {
      name: row.customer_name,
      address: row.customer_address,
      city: row.customer_city,
    },
    items: selectItems.all(row.id).map((i) => ({
      productId: i.product_id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    })),
    total: row.total,
    status: row.status,
    createdAt: row.created_at,
  });

  // Commande + lignes dans UNE transaction : tout ou rien.
  const saveNew = db.transaction((order) => {
    insertOrder.run({
      id: order.id,
      userId: order.userId,
      name: order.customer.name,
      address: order.customer.address,
      city: order.customer.city,
      total: order.total,
      status: order.status,
      createdAt: order.createdAt,
    });
    for (const item of order.items) insertItem.run({ orderId: order.id, ...item });
  });

  return {
    create(order) {
      saveNew(order);
      return toApi(selectOrder.get(order.id));
    },
    findById(id) {
      const row = selectOrder.get(id);
      return row ? toApi(row) : null;
    },
    findByUser(userId) {
      return selectByUser.all(userId).map(toApi);
    },
    setStatus(id, status) {
      updateStatus.run(status, id);
      return this.findById(id);
    },
    // Changement conditionnel : évite les courses (ex. double annulation).
    // Retourne true si la ligne était bien dans l'état attendu.
    setStatusIf(id, expected, next) {
      return updateStatusIf.run({ id, expected, next }).changes === 1;
    },
  };
}

module.exports = { createOrderRepository };
