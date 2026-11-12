const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { HttpError } = require('./errors');
const config = require('./config');

function createApp({ repo }) {
    const app = express();
    app.use(helmet());
    app.use(cors({ origin: config.allowedOrigins, allowedHeaders: ['Content-Type', 'Authorization'] }));
    app.use(express.json({ limit: '10kb' }));

    const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
    const isUnique = e => e && e.code === 'SQLITE_CONSTRAINT' && /UNIQUE/i.test(e.message || '');

    const TRANSITIONS = {
        PREPARING: ['SHIPPED'],
        SHIPPED: ['IN_TRANSIT'],
        IN_TRANSIT: ['DELIVERED'],
        DELIVERED: [],
        CANCELLED: []
    };
    const SYNCED_TO_ORDER = ['SHIPPED', 'DELIVERED'];

    const authenticateUser = (req, res, next) => {
        const [scheme, token] = (req.headers.authorization || '').split(' ');
        if (scheme !== 'Bearer' || !token) return res.status(401).json({ message: 'Unauthorized' });
        try {
            req.user = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
            next();
        } catch (_) {
            res.status(401).json({ message: 'Invalid or expired token' });
        }
    };

    const isAdmin = (req) => req.user && req.user.role === 'ADMIN';

    async function request(url, { method = 'GET', headers = {}, body } = {}) {
        let res;
        try {
            res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', ...headers },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(config.requestTimeoutMs)
            });
        } catch (_) {
            throw new HttpError(502, 'Upstream service unavailable');
        }
        let data = null;
        try { data = await res.json(); } catch (_) { /* no JSON body */ }
        return { ok: res.ok, status: res.status, data };
    }

    function formatShipment(row) {
        return {
            id: row.id, orderId: row.order_id,
            address: { name: row.recipient_name, address: row.address, city: row.city },
            trackingNumber: row.tracking_number, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at
        };
    }

    async function canAccessShipment(req, shipment) {
        if (isAdmin(req)) return true;
        if (shipment.user_id) return shipment.user_id === req.user.id;

        let orderRes;
        try {
            orderRes = await request(`${config.ordersUrl}/api/orders/${encodeURIComponent(shipment.order_id)}`, {
                headers: { Authorization: req.headers.authorization }
            });
        } catch (_) { return false; }
        if (!orderRes.ok || !orderRes.data || orderRes.data.userId !== req.user.id) return false;

        await repo.updateUserIdIfMissing(shipment.id, req.user.id);
        return true;
    }

    app.get('/health', (req, res) => res.json({ status: 'ok', service: config.serviceName }));

    app.get('/api/shipments', authenticateUser, wrap(async (req, res) => {
        const rows = isAdmin(req) ? await repo.getAll() : await repo.getByUser(req.user.id);
        res.json(rows.map(formatShipment));
    }));

    app.get('/api/shipments/order/:orderId', authenticateUser, wrap(async (req, res) => {
        const row = await repo.getByOrder(req.params.orderId);
        if (!row || !(await canAccessShipment(req, row))) throw new HttpError(404, 'Shipment not found');
        res.json(formatShipment(row));
    }));

    app.post('/api/shipments', authenticateUser, wrap(async (req, res) => {
        const { orderId } = req.body || {};
        if (typeof orderId !== 'string' || !orderId || orderId.length > 100) throw new HttpError(400, 'orderId is required');

        const orderRes = await request(`${config.ordersUrl}/api/orders/${encodeURIComponent(orderId)}`, {
            headers: { Authorization: req.headers.authorization }
        });
        if (!orderRes.ok) throw new HttpError(404, 'Order not found');
        const order = orderRes.data;

        if (order.status !== 'PAID') throw new HttpError(400, `Cannot ship order in status: ${order.status}`);

        const shipmentId = `shipment-${crypto.randomUUID()}`;
        const tracking = `MSOA-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const now = new Date().toISOString();

        try {
            await repo.insert({
                id: shipmentId, orderId, userId: order.userId,
                recipientName: order.customer.name, address: order.customer.address, city: order.customer.city,
                trackingNumber: tracking, now
            });
        } catch (e) {
            if (isUnique(e)) throw new HttpError(409, 'Shipment already exists for this order');
            throw e;
        }

        res.status(201).json(formatShipment(await repo.getById(shipmentId)));
    }));

    app.patch('/api/shipments/:id/status', authenticateUser, wrap(async (req, res) => {
        const { status } = req.body || {};
        const shipmentId = req.params.id;

        const shipment = await repo.getById(shipmentId);
        if (!shipment || !(await canAccessShipment(req, shipment))) throw new HttpError(404, 'Shipment not found');
        if (typeof status !== 'string' || !(TRANSITIONS[shipment.status] || []).includes(status)) {
            throw new HttpError(400, `Invalid transition: ${shipment.status} → ${status}`);
        }

        const prev = shipment.status;
        const nowStr = new Date().toISOString();
        const cas = await repo.compareAndSetStatus(shipmentId, status, prev, nowStr);

        if (cas.changes === 0) throw new HttpError(409, 'Shipment status changed concurrently, please retry');

        if (SYNCED_TO_ORDER.includes(status)) {
            let sync;
            try {
                sync = await request(`${config.ordersUrl}/api/orders/${encodeURIComponent(shipment.order_id)}/status`, {
                    method: 'PATCH',
                    headers: { Authorization: req.headers.authorization },
                    body: { status }
                });
            } catch (_) {
                sync = { ok: false, status: 502 };
            }

            if (!sync.ok) {
                await repo.compareAndSetStatus(shipmentId, prev, status, new Date().toISOString())
                    .catch(e => console.error(`[Shipping] RECONCILE: could not roll back shipment ${shipmentId} to ${prev}: ${e.message}`));
                throw new HttpError(sync.status === 409 ? 409 : 502, 'Failed to sync status with Orders Service. Transition rolled back.');
            }
        }

        res.json(formatShipment(await repo.getById(shipmentId)));
    }));

    app.use((req, res) => res.status(404).json({ message: 'Not found' }));
    app.use((err, req, res, next) => {
        if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
        if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body.' });
        if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Payload too large.' });
        console.error('[Shipping] Unhandled error:', err);
        res.status(500).json({ message: 'Internal server error' });
    });

    return app;
}

module.exports = { createApp };