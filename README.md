# markdown.hanif.app

Render file markdown dengan tema, lalu bagikan lewat link pendek. Simpel.

## Cara kerja

- **Editor** (`/`) — tulis/paste markdown, live preview di kanan, pilih tema.
- **Anonim (tanpa login)** — bikin → dapet short link `/d/<id>`. Quick share, ga bisa diedit.
- **Login (email + password)** — semua dokumen kesimpen ke akun, bisa diedit kapan aja, dan bisa dikasih passcode.
- **Dashboard** (`/app`) — list semua dokumen lo: edit, view, copy link, hapus.
- **Passcode per dokumen** — proteksi view. Pengunjung harus masukin passcode (`/d/:id` nampilin halaman unlock). Owner bypass otomatis.
- **Lupa passcode** — owner bisa lihat lagi passcode-nya dari editor/modal dengan verifikasi password akun (passcode disimpan ter-enkripsi, bukan hash).
- **Mermaid** — blok ` ```mermaid ` di-render jadi diagram (flowchart, sequence, dll). Bundle `mermaid.js` di-load lazy dari `/vendor/mermaid.min.js` (cuma kalau ada blok mermaid). Jalan di view page + live preview, ikut tema.
- **View page** (`/d/:id`) — render server-side, aman dari XSS, tema sesuai pilihan.
  - Override tema lewat query: `/d/:id?theme=dark`
- **Raw** (`/raw/:id`) — markdown mentah (text/plain), hormati passcode gate.

## Tema

`light`, `dark`, `sepia`, `dracula`, `nord` — lihat `lib/themes.js`.

## Stack

Node + Express, render `marked` + `highlight.js`, sanitize `DOMPurify`,
storage SQLite (`better-sqlite3`). Tanpa build step di frontend.

## Dev

```bash
npm install
npm run dev          # http://localhost:3000
```

## Env

| Var              | Default  | Keterangan                                              |
|------------------|----------|---------------------------------------------------------|
| `PORT`           | `3000`   | Port server                                             |
| `DATA_DIR`       | `./data` | Lokasi SQLite + `keys.json` (HARUS persistent)          |
| `MASTER_KEY`     | auto     | Hex 32-byte buat enkripsi passcode. Auto-generate ke `keys.json` kalau kosong |
| `SESSION_SECRET` | auto     | Secret buat signed cookie. Auto-generate ke `keys.json` |

> `MASTER_KEY` & `SESSION_SECRET` di-generate sekali dan disimpen di
> `DATA_DIR/keys.json` (stabil lintas restart). Asal volume `/app/data`
> persistent, ga perlu set manual. Kalau diset via env, env yang menang.

## Deploy (Coolify)

Build pakai `Dockerfile`. Mount persistent volume ke `/app/data` biar dokumen
+ key ga ilang tiap redeploy. Healthcheck di `/livez`.

## Endpoint

| Method | Path                          | Fungsi                                      |
|--------|-------------------------------|---------------------------------------------|
| GET    | `/`                           | Editor                                      |
| GET    | `/login` · `/app`             | Login/daftar · Dashboard                    |
| POST   | `/api/auth/register`·`login`·`logout` | Auth                                |
| GET    | `/api/auth/me`                | User sekarang                               |
| POST   | `/api/docs`                   | Simpan doc → `{ id, url, owned }`           |
| GET    | `/api/docs`                   | List doc milik user (auth)                  |
| GET·PUT·DELETE | `/api/docs/:id`       | Ambil/edit/hapus doc (owner)                |
| PUT    | `/api/docs/:id/passcode`      | Set/hapus passcode (owner)                  |
| POST   | `/api/docs/:id/reveal-passcode` | Lihat passcode (verifikasi password akun) |
| POST   | `/api/docs/:id/unlock`        | Buka doc ber-passcode (set cookie)          |
| POST   | `/api/preview`                | Render preview → `{ html }`                 |
| GET    | `/api/themes` · `/api/fonts`  | Daftar tema · daftar font                   |
| GET    | `/d/:id` · `/:slug`           | View page (gate passcode)                   |
| GET    | `/raw/:id`                    | Markdown mentah (gate passcode)             |
| GET    | `/livez`                      | Healthcheck                                 |

### Public API (v1)

Akses programatik: tukar credentials → token Bearer → tarik list short link.
Halaman dokumentasi: **`/api`**.

Semua endpoint `/api/v1/docs*` butuh header `Authorization: Bearer <token>`.

| Method | Path                          | Fungsi                                            |
|--------|-------------------------------|---------------------------------------------------|
| POST   | `/api/v1/auth/token`          | `{ email, password }` → `{ token }` (30 hari)     |
| GET    | `/api/v1/docs`                | List semua short link milik akun                  |
| POST   | `/api/v1/docs`                | Push markdown baru → `{ id, url, slug }` (slug/theme/font/passcode opsional) |
| GET    | `/api/v1/docs/:idOrSlug`      | Ambil 1 dokumen + konten mentah                   |
| PUT    | `/api/v1/docs/:idOrSlug`      | Replace konten (link tetap sama)                  |
| PUT    | `/api/v1/docs/:idOrSlug/slug` | Set/ganti/hapus custom link                       |
| DELETE | `/api/v1/docs/:idOrSlug`      | Hapus dokumen                                     |

```bash
# 1) tukar credentials jadi token
TOKEN=$(curl -s -X POST https://markdown.hanif.app/api/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"email":"kamu@email.com","password":"••••••••"}' | jq -r .token)

# 2) tarik semua short link
curl -s https://markdown.hanif.app/api/v1/docs \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Security notes

- Password akun di-hash `scrypt` (salt per-user, `timingSafeEqual`).
- Passcode dokumen di-**enkripsi** AES-256-GCM (bukan hash) supaya bisa di-reveal
  ke owner setelah verifikasi ulang password akun.
- Session server-side (tabel `sessions`), cookie `httpOnly`+`SameSite=Lax`,
  `Secure` di production. Unlock pakai signed cookie per-dokumen (24 jam).
- Rate limit di endpoint auth, write, unlock, reveal.
