# Panduan Deploy Dragon Machine

Ada 4 opsi deploy, diurutkan dari yang paling mudah:

---

## Opsi 1 — Railway.app ⭐ (Paling Mudah, Gratis)

**Kelebihan:** setup 5 menit, otomatis HTTPS + domain, free tier cukup untuk
penggunaan internal gudang. Cocok untuk pemula.

### Langkah

1. **Push ke GitHub**
   ```bash
   cd server
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create dragon-machine --public --source=. --push
   ```
   (Atau buat repo manual di github.com lalu push.)

2. **Hubungkan ke Railway**
   - Buka https://railway.app → **Start a New Project**
   - Pilih **Deploy from GitHub repo** → pilih repo `dragon-machine`
   - Railway otomatis deteksi Node.js dan jalankan `npm start`

3. **Set Environment Variables**
   Di tab **Variables**, tambahkan:
   ```
   JWT_SECRET        = <hasil dari "node -e 'console.log(...)'" di cmd>
   ADMIN_PASSWORD    = <password baru>
   TAMU_PASSWORD     = <password baru>
   NODE_VERSION      = 20
   ```

4. **Dapatkan Domain**
   - Tab **Settings** → **Domains** → **Generate Domain**
   - Railway kasih URL `https://dragon-machine.up.railway.app`
   - Mau pakai domain sendiri (mis. `app.gudang-farmasi.id`)?
     → **Custom Domain** → masukkan domain → buat CNAME record
       di DNS panel domain Anda ke `up.railway.app`.

5. **Tambah Volume untuk Persistence** ⚠️ WAJIB
   - Tab **Data** → **+ New Volume** → mount path `/app/data`
   - Tab **Data** → **+ New Volume** → mount path `/app/uploads`
   - Tanpa ini, database & foto hilang tiap deploy ulang!

6. **Redeploy** setelah tambah volume, lalu buka URL-nya.

---

## Opsi 2 — Render.com (Gratis, Sedikit Setup)

**Kelebihan:** free tier, HTTPS + custom domain built-in.

### Langkah

1. **Push ke GitHub** (sama seperti Railway langkah 1)

2. **Hubungkan ke Render**
   - Buka https://render.com → **New +** → **Web Service**
   - Pilih repo GitHub Anda
   - Konfigurasi:
     - **Name:** dragon-machine
     - **Region:** Singapore
     - **Branch:** main
     - **Build Command:** `npm install`
     - **Start Command:** `node server.js`
     - **Plan:** Free

3. **Set Environment Variables** (di bagian *Environment*):
   ```
   JWT_SECRET     = <string acak>
   ADMIN_PASSWORD = <password baru>
   TAMU_PASSWORD  = <password baru>
   ```

4. **PENTING: Disk untuk Database**
   - Free tier Render **reset storage** tiap restart. Untuk data persisten
     Anda perlu:
     - **Opsi A:** Upgrade ke plan berbayar ($7/bulan) → tambahkan **Disk**
       mount `/app/data`
     - **Opsi B:** Pakai **PostgreSQL eksternal gratis** (lihat catatan di bawah)
     - **Opsi C:** Backup manual: download `data/dragon.db` via SFTP/Shell
       sebelum restart

5. **Custom Domain**
   - Tab **Settings** → **Custom Domain** → masukkan domain
   - Buat CNAME record di DNS panel domain

---

## Opsi 3 — VPS (Paling Fleksibel, Bayar)

**Kelebihan:** kontrol penuh, bisa pakai domain sendiri tanpa batas,
bisa backup otomatis.

**Provider VPS murah:** DigitalOcean ($6/bulan), Contabo, IDCloudHost, dsb.
Pilih OS **Ubuntu 22.04** atau lebih baru.

### Langkah

1. **Login ke VPS & install Node.js**
   ```bash
   ssh root@<IP-VPS>
   apt update && apt upgrade -y
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs nginx certbot python3-certbot-nginx
   ```

2. **Buat user & folder aplikasi**
   ```bash
   adduser dragon
   mkdir -p /var/www/dragon
   chown dragon:dragon /var/www/dragon
   ```

3. **Upload project ke VPS**
   ```bash
   # Dari komputer lokal:
   scp -r server/* dragon@<IP-VPS>:/var/www/dragon/
   ```

4. **Install & setup PM2**
   ```bash
   ssh dragon@<IP-VPS>
   cd /var/www/dragon
   npm install
   cp .env.example .env
   nano .env    # isi JWT_SECRET dll
   ```
   ```bash
   sudo npm install -g pm2
   pm2 start server.js --name dragon
   pm2 startup        # ikuti instruksinya
   pm2 save
   ```

5. **Setup Nginx reverse proxy**
   ```bash
   sudo nano /etc/nginx/sites-available/dragon
   ```
   Isi:
   ```nginx
   server {
       listen 80;
       server_name app.gudang-farmasi.id www.app.gudang-farmasi.id;

       client_max_body_size 25M;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   ```bash
   sudo ln -s /etc/nginx/sites-available/dragon /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. **HTTPS gratis dengan Let's Encrypt**
   ```bash
   sudo certbot --nginx -d app.gudang-farmasi.id
   ```

7. **Setup DNS**
   Di panel domain (Niagahoster, Cloudflare, dsb), buat **A record**:
   ```
   Type: A
   Name: app
   Value: <IP-VPS>
   TTL: 300
   ```

8. **Backup otomatis database (opsional)**
   ```bash
   crontab -e
   ```
   Tambah:
   ```
   0 2 * * * cp /var/www/dragon/data/dragon.db /var/www/dragon/backups/dragon-$(date +\%F).db
   ```

---

## Opsi 4 — cPanel / Shared Hosting

**Catatan:** Banyak shared hosting di Indonesia (Niagahoster, Hostinger)
belum mendukung Node.js di shared plan. Anda butuh **VPS** atau
**Cloud Hosting** dengan akses SSH + Node.js.

Jika hosting Anda mendukung Node.js (mis. Niagahoster Cloud Hosting):

1. Login cPanel → **Setup Node.js App**
2. Upload isi folder `server/` ke `public_html/dragon/`
3. Set **Application root** = `dragon`
4. Set **Application URL** = `/dragon`
5. Set **Application startup file** = `server.js`
6. Klik **Run npm install** di cPanel
7. Tambahkan Environment Variables (JWT_SECRET dll) di cPanel
8. Restart app

Akses via `https://domainanda.com/dragon/`.

---

## Custom Domain di Railway / Render

1. Beli domain di Namecheap, Niagahoster, atau Cloudflare Registrar
2. Di Railway/Render dashboard → **Custom Domain** → masukkan `app.domainanda.id`
3. Mereka akan kasih **CNAME target** (mis. `xxx.up.railway.app`)
4. Di panel DNS domain Anda, buat:
   - **A record** (kalau pakai VPS): point ke IP server
   - **CNAME record** (kalau Railway/Render): point ke target yang dikasih

Tunggu propagasi DNS 5–30 menit. HTTPS otomatis terpasang.

---

## Troubleshooting

### "JWT_SECRET tidak ditemukan"
Set environment variable `JWT_SECRET` minimal 32 karakter random.

### Database hilang setelah restart
Pada Railway/Render free tier, storage ephemeral. Tambahkan **Volume** yang
mount ke `/app/data` (Railway) atau pakai **Persistent Disk** (Render
berbayar). Lihat langkah di atas.

### Foto tidak muncul
Cek folder `uploads/` ada dan writable. Cek Nginx config
`client_max_body_size 25M;` (sudah ada di contoh di atas).

### 401 Unauthorized terus
Token JWT expired (default 12 jam). Logout lalu login ulang. Untuk
memperpanjang, naikkan `JWT_EXPIRES_IN`.

### Port sudah dipakai
Set `PORT=4000` (atau port lain) di environment variable.

---

## Maintenance Harian

- **Backup database:** `data/dragon.db` adalah file SQLite. Cukup download
  secara berkala. Bisa dijadwalkan dengan cron (lihat Opsi 3).
- **Update password:** Ganti `ADMIN_PASSWORD` di environment variable lalu
  restart. Untuk produksi, tambahkan halaman "Ganti Password" di frontend.
- **Cek log:** `pm2 logs dragon` (VPS) atau tab **Logs** di Railway/Render.
