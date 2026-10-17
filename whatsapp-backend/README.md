# WhatsApp Gateway – Render deploy

1. Render.com → New → **Web Service** → apna GitHub repo chunein.
2. Settings:
   - **Root Directory:** `whatsapp-backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance:** Free
3. Environment variables:
   - `API_KEY` = koi bhi secret password (dashboard mein yahi daalna hai)
   - `DATABASE_URL` = free Postgres URL (Neon.tech / Supabase / Render Postgres). Isse restart par login nahi tootega.
4. Deploy ke baad URL milega, jaise `https://xyz.onrender.com`.
5. **cron-job.org** par free job: `https://xyz.onrender.com/ping` har 5–7 minute.

## API
Header: `x-api-key: <API_KEY>`
- `GET /ping` – keep alive (no key)
- `GET /status` – status, QR image, pairing code
- `POST /connect`
- `POST /pair-phone` `{ "phone": "919876543210" }`
- `POST /send-otp` `{ "phone": "919876543210", "otp": "123456" }` (otp optional)
- `POST /send-message` `{ "phone": "...", "message": "..." }`
- `POST /disconnect`
- `GET /logs`
