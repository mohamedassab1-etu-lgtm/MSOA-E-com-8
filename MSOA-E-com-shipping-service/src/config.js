require('dotenv').config();

const ALLOWED_ORIGINS = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map(s => s.trim()).filter(Boolean);

module.exports = {
    serviceName: 'shipping',
    port: Number(process.env.PORT) || 8086,
    host: process.env.HOST || '127.0.0.1',
    jwtSecret: process.env.JWT_SECRET,
    ordersUrl: process.env.ORDERS_URL || 'http://localhost:8084',
    requestTimeoutMs: 5000,
    allowedOrigins: ALLOWED_ORIGINS,
    dbPath: require('path').resolve(__dirname, '..', 'shipping.db')
};