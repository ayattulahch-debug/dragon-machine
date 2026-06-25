# Dragon Machine — Web App (Node.js + Express + SQLite)

Sistem Manajemen Bahan & Reagen Laboratorium — backend Node.js,
database SQLite, autentikasi JWT.

## Struktur Folder

```
server/                      ← PROJECT UTAMA
├── server.js                ← Express app (semua endpoint API)
├── db.js                    ← Skema & seed database SQLite
├── admin-api.js             ← Admin database viewer API
├── package.json             ← Dependensi Node.js
├── .env / .env.example      ← Variabel lingkungan
├── public/                  ← File statis (frontend)
│   ├── index.html           ← Halaman dashboard utama
│   ├── login.html           ← Halaman login
│   └── admin.html           ← Admin database viewer
├── data/                    ← Database SQLite (otomatis dibuat)
│   └── dragon.db
└── uploads/                 ← Foto barang masuk (otomatis dibuat)
```

## Cara Kerja

- **Frontend** (vanilla JS + Bootstrap 5 + Tailwind CSS) memanggil API
  Express melalui `fetch()` dengan token JWT di header `Authorization`.
- **Backend Express** menyediakan endpoint REST di `/api/*`. Setelah login,
  token JWT disimpan di `localStorage` dan dikirim otomatis pada setiap request.
- **Database** SQLite via `better-sqlite3`, auto-seed dengan data contoh
  saat pertama dijalankan.

## Login Default

| Username | Password | Role   |
|----------|----------|--------|
| `admin`  | `admin123` | Master |
| `tamu`   | `tamu123`  | Tamu   |

> Ganti password setelah login pertama lewat halaman admin,
> atau langsung ubah di environment variable sebelum deploy.

## Menjalankan Lokal (Testing)

```bash
cd server
npm install
cp .env.example .env       # opsional, default juga jalan
node server.js
```

Buka `http://localhost:3000` di browser. Login dengan `admin / admin123`.

## Deploy ke Production

Lihat **[DEPLOY.md](./DEPLOY.md)** untuk panduan lengkap:
- **Railway.app** (paling mudah, gratis)
- **Render.com** (gratis, sedikit setup)
- **VPS** (paling fleksibel, pakai PM2 + Nginx)
- **cPanel/Shared Hosting** (kalau hosting Anda mendukung Node.js)

## Environment Variables

| Nama              | Wajib | Default       | Keterangan                                  |
|-------------------|-------|---------------|---------------------------------------------|
| `PORT`            | tidak | `3000`        | Port server (Railway/Render set otomatis)   |
| `JWT_SECRET`      | **ya**| -             | String acak min. 32 karakter. **WAJIB** ganti di production! |
| `JWT_EXPIRES_IN`  | tidak | `43200`       | Masa aktif token (detik). Default 12 jam.   |
| `ADMIN_USERNAME`  | tidak | `admin`       | Username admin awal                         |
| `ADMIN_PASSWORD`  | tidak | `admin123`    | Password admin awal (seed)                  |
| `ADMIN_NAME`      | tidak | `Administrator`| Nama lengkap admin                         |
| `TAMU_USERNAME`   | tidak | `tamu`        | Username tamu awal                          |
| `TAMU_PASSWORD`   | tidak | `tamu123`     | Password tamu awal (seed)                   |
| `TAMU_NAME`       | tidak | `User Tamu`   | Nama lengkap tamu                           |

### Generate JWT_SECRET yang kuat

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Backup Database

Database ada di `server/data/dragon.db`. Untuk backup, cukup download file
tersebut (saat server tidak aktif, atau pakai SQLite online backup).
Lampirkan ke cron job jika perlu backup harian.

