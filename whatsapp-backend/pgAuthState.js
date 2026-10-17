// Stores the WhatsApp login session in Postgres so Render restarts don't log you out.
import pg from "pg";
import { initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys";

export async function usePgAuthState(databaseUrl, sessionId = "default") {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  await pool.query(
    `CREATE TABLE IF NOT EXISTS wa_auth (session TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (session, key))`
  );

  const read = async (key) => {
    const r = await pool.query("SELECT value FROM wa_auth WHERE session=$1 AND key=$2", [sessionId, key]);
    return r.rows[0] ? JSON.parse(r.rows[0].value, BufferJSON.reviver) : null;
  };
  const write = (key, data) =>
    pool.query(
      `INSERT INTO wa_auth (session,key,value) VALUES ($1,$2,$3)
       ON CONFLICT (session,key) DO UPDATE SET value=EXCLUDED.value`,
      [sessionId, key, JSON.stringify(data, BufferJSON.replacer)]
    );
  const remove = (key) => pool.query("DELETE FROM wa_auth WHERE session=$1 AND key=$2", [sessionId, key]);

  const creds = (await read("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out = {};
          await Promise.all(
            ids.map(async (id) => {
              let v = await read(`${type}-${id}`);
              if (type === "app-state-sync-key" && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
              out[id] = v;
            })
          );
          return out;
        },
        set: async (data) => {
          const tasks = [];
          for (const type in data)
            for (const id in data[type]) {
              const v = data[type][id];
              tasks.push(v ? write(`${type}-${id}`, v) : remove(`${type}-${id}`));
            }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => write("creds", creds),
    clear: () => pool.query("DELETE FROM wa_auth WHERE session=$1", [sessionId]),
  };
}
