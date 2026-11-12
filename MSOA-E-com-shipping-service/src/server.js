const config = require('./config');

if (!config.jwtSecret || config.jwtSecret.length < 32) {
    console.error('[Shipping] JWT_SECRET missing or shorter than 32 characters. Refusing to start.');
    process.exit(1);
}

const { initDatabase } = require('./db');
const { createShippingRepository } = require('./shippingRepository');
const { createApp } = require('./app');

const db = initDatabase(config.dbPath);

db.initDb().then(() => {
    const repo = createShippingRepository(db);
    const app = createApp({ repo });
    
    app.listen(config.port, config.host, () => {
        console.log(`[Shipping] Independent Service listening on ${config.host}:${config.port}`);
    });
}).catch(err => { 
    console.error('[Shipping] Startup failed:', err); 
    process.exit(1); 
});