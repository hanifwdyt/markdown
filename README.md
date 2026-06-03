# markdown.hanif.app

Render file markdown dengan tema, lalu bagikan lewat link pendek. Simpel.

## Cara kerja

- **Editor** (`/`) — tulis/paste markdown, live preview di kanan, pilih tema.
- **Share** — markdown disimpan di server, balik short link `/(d)/<id>`.
- **View page** (`/d/:id`) — render server-side, aman dari XSS, tema sesuai pilihan.
  - Override tema lewat query: `/d/:id?theme=dark`
- **Raw** (`/raw/:id`) — markdown mentah (text/plain).

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

| Var        | Default       | Keterangan                         |
|------------|---------------|------------------------------------|
| `PORT`     | `3000`        | Port server                        |
| `DATA_DIR` | `./data`      | Lokasi file SQLite (persistent)    |

## Deploy (Coolify)

Build pakai `Dockerfile`. Mount persistent volume ke `/app/data` biar dokumen
ga ilang tiap redeploy. Healthcheck di `/livez`.

## Endpoint

| Method | Path           | Fungsi                          |
|--------|----------------|---------------------------------|
| GET    | `/`            | Editor                          |
| POST   | `/api/docs`    | Simpan doc → `{ id, url }`      |
| POST   | `/api/preview` | Render preview → `{ html }`    |
| GET    | `/api/themes`  | Daftar tema                     |
| GET    | `/d/:id`       | View page (HTML)                |
| GET    | `/raw/:id`     | Markdown mentah                 |
| GET    | `/livez`       | Healthcheck                     |
