const sqlite3 = require('sqlite3').verbose();

function initDatabase(dbPath) {
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) console.error(`[Shipping] Database error: ${err.message}`);
        else console.log('[Shipping] Connected to shipping.db');
    });

    const run = (sql, params = []) => new Promise((resolve, reject) => { 
        db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); }); 
    });
    const get = (sql, params = []) => new Promise((resolve, reject) => { 
        db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); }); 
    });
    const all = (sql, params = []) => new Promise((resolve, reject) => { 
        db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); }); 
    });
    const exec = (sql) => new Promise((resolve, reject) => { 
        db.exec(sql, (err) => { if (err) reject(err); else resolve(); }); 
    });

    async function ensureColumn(table, column, ddl) {
        const cols = await all(`PRAGMA table_info(${table})`);
        if (!cols.some(c => c.name === column)) await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }

    async function initDb() {
        await exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
        await run(`CREATE TABLE IF NOT EXISTS shipments (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL,
            recipient_name TEXT,
            address TEXT,
            city TEXT,
            tracking_number TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )`);
        await ensureColumn('shipments', 'user_id', 'TEXT');
        await run("CREATE INDEX IF NOT EXISTS idx_shipments_user ON shipments(user_id)");
        await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id)")
            .catch(e => console.error('[Shipping] Could not create UNIQUE index on shipments.order_id:', e.message));
        await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments(tracking_number)")
            .catch(e => console.error('[Shipping] Could not create UNIQUE index on shipments.tracking_number:', e.message));
    }

    return { run, get, all, initDb };
}

module.exports = { initDatabase };