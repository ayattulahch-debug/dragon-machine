# Progress Dragon Machine

> **Catatan Penting:** File ini dibuat untuk mencatat status proyek saat ini.  
> **Belum deploy ke production.** Harap lakukan pengecekan (Go Live / lokal) terlebih dahulu sebelum deploy.

---

## Status Saat Ini

| Item | Status |
|------|--------|
| Commit Git | **Belum ada** (`No commits yet`) |
| Push ke GitHub | **Belum** |
| Deploy ke server (Railway/Render/VPS) | **Belum** — ditahan sengaja |
| Testing Lokal / Go Live | **Siap dilakukan** |

---

## Apa yang Sudah Dibangun

### 1. Backend (Node.js + Express + SQLite)
- **Lokasi:** `server/`
- **File utama:**
  - `server.js` — API Express (autentikasi JWT, CRUD bahan, transaksi, barang masuk PO, laporan)
  - `db.js` — Skema & seed database SQLite
  - `admin-api.js` — Endpoint admin tambahan
  - `package.json` — Dependensi (express, bcryptjs, jsonwebtoken, sqlite3, multer, dotenv, dll.)
- **Database:** SQLite (`server/data/dragon.db`), auto-generate saat pertama kali jalan
- **Uploads:** Folder `server/uploads/` untuk foto barang masuk

### 2. Frontend (HTML + Bootstrap 5 + Vanilla JS)
- **Lokasi:** `server/public/` (untuk versi Node.js) dan file root `Index.html` / `login.html` (referensi lama)
- **Halaman:**
  - `login.html` — Halaman login (support offline fallback: admin/admin123, tamu/tamu123)
  - `index.html` — Dashboard utama dengan sidebar & offcanvas
- **Fitur UI:**
  - **Dashboard:** Statistik total item, stok aman, stok habis/kritis (dengan klik untuk detail)
  - **Katalog Bahan:** Bahan 2026, 2025, 2024, Pembelian Langsung
  - **Pencarian Cepat:** Global search dengan filter lokasi
  - **Form Permintaan (Barang Keluar):** Sistem keranjang, pilih bahan autocomplete, input pemohon & distribusi lab
  - **Riwayat Transaksi:** Tabel riwayat keluar dengan filter tahun & pencarian
  - **Barang Masuk (PO):** Tab per tahun (2024/2025/2026), statistik (Total/Lengkap/Lebih/Kurang/dll), tombol Transfer ke Stok
  - **Laporan:** Laporan bulanan & unduh sisa stok ke Excel
  - **Multi-Tema:** Dark (default), Light, Murim, Cyberpunk, Ocean
  - **Pengaturan Sistem:** Buka via sidebar (master-only)
  - **Responsive:** Optimasi mobile (offcanvas, d-grid, font-size menyesuaikan)

### 3. Dokumentasi
- `README.md` — Penjelasan struktur, cara kerja, login default, env variables, backup
- `DEPLOY.md` — Panduan deploy ke Railway, Render, VPS, cPanel

### 4. File Lama (Referensi)
- `Code.gs` — Google Apps Script lama (tidak dipakai di versi Node.js)
- `Index.html` (root) & `login.html` (root) — Snapshot file asli sebelum dipindah ke `server/public/`

---

## File / Folder yang Ada di Working Directory

```
Gudang Web Asli/
├── server/                  ← PROJECT UTAMA (Node.js)
│   ├── server.js
│   ├── db.js
│   ├── admin-api.js
│   ├── package.json
│   ├── .env / .env.example
│   ├── public/
│   │   ├── index.html
│   │   ├── login.html
│   │   └── shim.js          ← Polyfill google.script.run
│   ├── data/
│   │   └── dragon.db        ← Database SQLite (auto-create)
│   ├── uploads/             ← Foto barang masuk
│   ├── node_modules/
│   └── ... (log, toml, dsb)
├── Index.html               ← File lama (referensi)
├── login.html               ← File lama (referensi)
├── Code.gs                  ← File lama GAS (referensi)
├── README.md
├── DEPLOY.md
└── PROGRESS.md              ← File ini
```

**Catatan Git:**
- Ada beberapa file yang sudah di-*stage* tapi belum di-commit.
- Ada modifikasi pada `Index.html` dan submodule `server`.
- Ada file untracked: `adminer-5.4.2.php`.

---

## Langkah Selanjutnya (Harus Dicek Dulu!)

### A. Testing Lokal (Go Live / Localhost)

**Sebelum deploy ke mana pun, pastikan berjalan normal di komputer lokal:**

1. **Install dependensi (jika belum):**
   ```bash
   cd server
   npm install
   ```

2. **Jalankan server:**
   ```bash
   node server.js
   ```
   atau jika pakai `npm start` (cek `package.json`).

3. **Buka di browser:**
   - `http://localhost:3000`
   - Login: `admin` / `admin123` atau `tamu` / `tamu123`

4. **Go Live (VS Code Live Server):**
   - Jangan langsung klik "Go Live" dari file `.html` di root, karena backend API tidak akan jalan.
   - **Cara benar:** Jalankan `node server.js` dulu, lalu buka `http://localhost:3000`.
   - Jika ingin pakai Live Server extension, pastikan proxy-nya mengarah ke `http://localhost:3000`, atau gunakan built-in server Node.js saja.

5. **Ceklist fitur yang wajib dicek:**
   - [ ] Login berhasil (admin & tamu)
   - [ ] Dashboard menampilkan statistik
   - [ ] Pencarian bahan jalan
   - [ ] Tambah bahan baru (master)
   - [ ] Form permintaan + keranjang
   - [ ] Riwayat transaksi muncul
   - [ ] Barang Masuk (PO) & Transfer ke Stok
   - [ ] Ganti tema (dark/light/murim/cyberpunk/ocean)
   - [ ] Upload foto di barang masuk (jika ada)
   - [ ] Database tersimpan di `server/data/dragon.db`

### B. Commit & Push (Setelah Testing OK)

1. **Commit:**
   ```bash
   git add .
   git commit -m "feat: initial Dragon Machine v2 (Node.js + SQLite)"
   ```

2. **Push ke GitHub:**
   ```bash
   gh repo create dragon-machine --public --source=. --push
   ```
   atau buat repo manual lalu `git remote add origin ...` dan push.

### C. Deploy ke Production

**JANGAN deploy dulu sebelum langkah A (testing lokal) benar-benar lolos.**

Pilihan platform (lihat `DEPLOY.md` untuk detail):
- **Railway.app** (paling mudah, gratis, HTTPS otomatis)
- **Render.com** (gratis, perlu persistent disk untuk database)
- **VPS** (DigitalOcean, Contabo, IDCloudHost, dsb.)
- **cPanel / Shared Hosting** (jika support Node.js)

---

## Catatan & Perhatian

- **Jangan lupa ganti `JWT_SECRET`** di production! Generate dengan:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- **Volume / Persistent Storage wajib** untuk Railway/Render agar database & foto tidak hilang saat redeploy.
- **Backup database rutin:** File `server/data/dragon.db` bisa di-copy sebagai backup.

---

*Terakhir di-update: 26 Juni 2026*
