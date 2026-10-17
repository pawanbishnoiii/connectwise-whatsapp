// Tiny key/value store: Postgres when DATABASE_URL is set, otherwise a JSON file.
import fs from "fs";
import pg from "pg";

const FILE = "./gateway-data.json";
let pool = null;
let cache = {};

export async function initStore(databaseUrl) {
  if (databaseUrl) {
    pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
    });
    await pool.query(`CREATE TABLE IF NOT EXISTS gw_store (key TEXT PRIMARY KEY, value JSONB NOT NULL)`);
    const r = await pool.query("SELECT key, value FROM gw_store");
    for (const row of r.rows) cache[row.key] = row.value;
  } else if (fs.existsSync(FILE)) {
    cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
  }
}

export function get(key, fallback) {
  return cache[key] ?? fallback;
}

export async function set(key, value) {
  cache[key] = value;
  if (pool) {
    await pool.query(
      `INSERT INTO gw_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)]
    );
  } else {
    fs.writeFileSync(FILE, JSON.stringify(cache));
  }
}
