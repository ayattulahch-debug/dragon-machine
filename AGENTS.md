# AGENTS.md — Memori Proyek Dragon Machine

> File ini dibaca otomatis tiap sesi. Berisi **target deploy**, **workflow perubahan**,
> dan **status terakhir**. JANGAN tanya ulang hal yang sudah tertulis di sini.

---

## 1. DEPLOY — Target & Cara (JANGAN tanya "deploy ke mana?")

| Item | Nilai |
|------|-------|
| **Platform aktif** | **Railway** (auto-deploy via GitHub integration) |
| **Repo** | `https://github.com/ayattulahch-debug/dragon-machine.git` |
| **Branch produksi** | `main` (push ke sini = trigger rebuild Railway) |
| **Builder** | NIXPACKS (lihat `railway.toml`) |
| **Start command** | `node server.js` |
| **Healthcheck** | `GET /api/health` → `{ ok: true }` (timeout 300s) |
| **Port** | `process.env.PORT || 3000` (Railway inject `PORT`) |
| **DB path (prod)** | via env `DB_PATH` (set di Railway dashboard) |
| **Alt config** | `fly.toml` ada (app `dragon-machine`, region `sin`, volume `/data`) — CADANGAN, bukan aktif |

### Trigger deploy
```
git add <file-relevan>
git commit -m "<conventional commit>"
git push origin main        # ← ini yang memicu Railway rebuild
```

### Yang TIDAK boleh di-stage / di-commit
- `server/data/dragon.db-shm` dan `server/data/dragon.db-wal` (runtime SQLite WAL, berubah tiap server jalan)
- `server/data/dragon.db` (database lokal, bukan source)
- `node_modules/`, `.env`, `*.log`, `uploads/*` (sudah di `.gitignore`)
- File screenshot / `.png` scratch yang tidak relevan

> Catatan: pola `.gitignore` `data/*` hanya match root, **tidak** cover `server/data/`.
> Jadi selalu stage file **secara eksplisit** (`git add public/index.html`), hindari `git add .`.

### Environment wajib di Railway dashboard
- `JWT_SECRET` — generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `DB_PATH` — path persistent volume untuk SQLite
- `NODE_ENV=production`
- Volume/persistent disk WAJIB agar DB & uploads tidak hilang saat redeploy

### CLI deploy di environment ini
- `fly`, `railway`, `gh` **tidak terinstall** di mesin lokal.
- Karena itu deploy = **commit + push** (Railway auto-build). Tidak perlu CLI.

---

## 2. WORKFLOW PERUBAHAN (JANGAN tanya "proses sampai mana?")

Urutan baku setiap permintaan perubahan:

1. **Riset** — `grep`/`glob`/`read` untuk pahami konteks & konvensi file.
2. **Edit** — ubah file (mimic style existing, pakai variabel CSS yang sudah ada).
3. **Verifikasi lokal** — jalankan `node server.js`, cek `GET http://localhost:3000/` → HTTP 200, tidak ada stderr error.
4. **Scan secret** — pastikan diff tidak mengandung `JWT_SECRET`/token/api_key.
5. **Stage selektif** — `git add <file>` eksplisit (lihat daftar larangan di atas).
6. **Commit** — conventional commit: `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`.
7. **Push** — `git push origin main` → Railway auto-rebuild.
8. **Update section 3 (Status)** di file ini.

### Stack proyek (pahami sebelum edit)
- **Frontend:** `public/index.html` (SINGLE FILE besar ~3160 baris). Bootstrap 5 + Tailwind CDN + vanilla JS. **TIDAK ADA build step. TIDAK ADA React.** Edit langsung, refresh browser = lihat hasil.
- **Backend:** `server.js` (Express + JWT auth), `db.js` (skema + seed SQLite via better-sqlite3), `admin-api.js` (endpoint admin).
- **Tema:** variabel CSS di `:root[data-theme="dark"]` / `[light"]` (`public/index.html:62-105`). Pakai var ini (`--bg-card`, `--text`, `--accent`, `--border`, dll) agar konsisten & support switch tema.
- **Login default (offline fallback):** `admin`/`admin123`, `tamu`/`tamu123`.

### Konvensi kode
- Z-index: sidebar `1040`, overlay `1030`, thead sticky `20`, modal Bootstrap `1055`, loading `9999`.
- Text kontras: input `#E5E7EB` / `var(--text)`, helper `#9CA3AF`, heading `var(--text-heading)`.
- Field readonly: pakai `readonly` (bukan `disabled`) + ikon gembok, agar teks tidak kena `opacity:0.6`.
- Commit message gaya: `feat(profil): ...`, `fix(mobile): ...`, `refactor(api): ...`.

---

## 3. STATUS TERAKHIR (update tiap selesai perubahan)

**Tanggal:** 27 Jun 2026
**Commit terakhir:** `151e56c` — `feat(profil): redesign modal pengaturan profil + fix urutan riwayat`
**Branch:** `main` (sync dengan `origin/main`)
**Status deploy:** Push terkirim → Railway rebuild ter-trigger. Pantau di dashboard Railway.

### Yang sudah dikerjakan di commit `151e56c`
- [x] Perbaiki z-index sidebar/overlay vs thead sticky (commit sebelumnya `5944c6c`, `831393c`)
- [x] Redesign modal **Pengaturan Profil**: dark premium, avatar gradient + inisial, spacing lega
- [x] Username & Role read-only dengan ikon gembok (`bi-lock-fill`)
- [x] Password show/hide toggle (ikon mata), auto-reset saat buka modal (`toggleProfilPassword()`)
- [x] Kontras teks: input `#E5E7EB`, helper `#9CA3AF`
- [x] Riwayat Transaksi: data terbaru di paling atas (hapus `.reverse()` di `renderRiwayatKeluar`)
- [x] Verifikasi server boots OK (HTTP 200, no stderr)

### Yang belum / TODO
- [ ] Update `PROGRESS.md` (masih out-of-date: tulis "Belum deploy" padahal sudah ada Railway config)
- [ ] Pertimbangkan tambah pola `server/data/` ke `.gitignore` agar WAL tak perlu di-skip manual
- [ ] Verifikasi visual modal profil & urutan riwayat di deploy Railway (setelah rebuild selesai)

### Riwayat commit (3 terakhir)
```
151e56c feat(profil): redesign modal pengaturan profil + fix urutan riwayat
5944c6c fix(mobile): increase overlay z-index, prevent scroll, disable main content when sidebar open
831393c fix(mobile): solid sidebar background, increase overlay opacity
```

---

## 4. CEK MANDIRI (sebelum tanya user)

Sebelum bertanya ke user, cek dulu:
- **"Deploy ke mana?"** → Baca section 1. Jawaban: Railway, via push ke `main`.
- **"Sampai mana?"** → Baca section 3. Jawaban: lihat commit terakhir + checklist.
- **"Pakai React/build step?"** → Baca section 2. Jawaban: tidak, vanilla JS di `public/index.html`.
- **"Boleh commit/push?"** → User pernah bilang "buat dan deploy" → push ke main diperbolehkan untuk perubahan yang sudah diminta. Untuk perubahan besar/radikal, konfirmasi dulu.
