<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- All gateway logic (auth, users, API keys, OTP, WhatsApp socket) lives in `whatsapp-backend/` on Render; the Lovable frontend is a pure client — WhatsApp Web needs an always-on process.
- Backend data uses `store.js` (Postgres if DATABASE_URL, else JSON file) — keeps setup to one optional env var.
