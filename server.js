require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const cloudinary = require('cloudinary').v2;

const JWT_SECRET = process.env.JWT_SECRET || 'dragon-machine-default-jwt-secret-change-in-production-2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
if (!process.env.JWT_SECRET) {
  console.warn('\n WARNING: JWT_SECRET tidak diatur, menggunakan default. Set JWT_SECRET di environment variables untuk production!\n');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const TAHUN_INI = new Date().getFullYear().toString();
const { db, getAll } = require('./db');
const adminApi = require('./admin-api');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.set('trust proxy', true);
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.use('/api/admin', authenticate, requireMaster, adminApi);

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ditemukan.' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa.' });
  }
}
function requireMaster(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated.' });
  if (req.user.role !== 'Master') return res.status(403).json({ error: 'Hanya Master yang bisa melakukan ini.' });
  next();
}

// ============================================================
// STATIC FILES & PAGE ROUTING
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));
app.get('/',        (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ============================================================
// API: LOGIN & TOKEN
// ============================================================
app.post('/api/login', (req, res) => {
  try {
    const args = req.body.args || [];
    const [username, password] = args;
    if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi.' });

    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username);
    if (!user) return res.status(401).json({ error: 'User tidak ditemukan.' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Password salah.' });

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      nama: user.nama_lengkap || user.username,
      permissions: JSON.parse(user.permissions || '[]'),
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ token, user: payload });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/verifyToken', authenticate, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ============================================================
// API: GET ALL DATA
// ============================================================
app.post('/api/getAllData', authenticate, (_, res) => res.json(getAll()));

// ============================================================
// API: BAHAN
// ============================================================
app.post('/api/saveBahanBaru', authenticate, requireMaster, (req, res) => {
  try {
    const d = req.body.args ? req.body.args[0] : req.body;
    const exists = db.prepare('SELECT 1 FROM bahan WHERE id = ?').get(d.id);
    if (exists) return res.status(400).json({ error: `ID Bahan '${d.id}' sudah ada!` });

    const saldoAwal = parseInt(d.saldoAwal) || 0;
    const masuk     = parseInt(d.masuk)     || 0;
    const keluar    = parseInt(d.keluar)    || 0;
    const stok      = saldoAwal + masuk - keluar;
    const status    = stok > 0 ? 'Tersedia' : 'Tidak Tersedia';

    db.prepare(`INSERT INTO bahan
      (id, nama_bahan, saldo_awal, lokasi, keluar, masuk, stok, satuan, keterangan, status, tahun, inden, catatan)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(d.id, d.namaBahan, saldoAwal, d.lokasi, keluar, masuk, stok,
            d.satuan, d.keterangan || '', status, d.tahun || TAHUN_INI, d.inden || 'Tidak', d.catatan || '');

    res.json(getAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/updateBahan', authenticate, requireMaster, (req, res) => {
  try {
    const d = req.body.args ? req.body.args[0] : req.body;
    const saldoAwal = parseInt(d.saldoAwal) || 0;
    const masuk     = parseInt(d.masuk)     || 0;
    const keluar    = parseInt(d.keluar)    || 0;
    const stok      = saldoAwal + masuk - keluar;
    const status    = stok > 0 ? 'Tersedia' : 'Tidak Tersedia';

    const result = db.prepare(`UPDATE bahan SET
      nama_bahan=?, saldo_awal=?, lokasi=?, keluar=?, masuk=?, stok=?, satuan=?,
      keterangan=?, status=?, tahun=?, inden=?, catatan=?
      WHERE id=?`)
      .run(d.namaBahan, saldoAwal, d.lokasi, keluar, masuk, stok, d.satuan,
           d.keterangan || '', status, d.tahun, d.inden, d.catatan || '', d.id);

    if (result.changes === 0) return res.status(404).json({ error: `Bahan dengan ID ${d.id} tidak ditemukan.` });
    res.json(getAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// API: BARANG KELUAR
// ============================================================
app.post('/api/saveBarangKeluar', authenticate, requireMaster, (req, res) => {
  try {
    const d = req.body.args ? req.body.args[0] : req.body;
    const idBahan = d.idBahan;
    const jumlah  = parseInt(d.jumlah) || 0;

    const txn = db.transaction(() => {
      const row = db.prepare('SELECT * FROM bahan WHERE id = ?').get(idBahan);
      if (!row) throw new Error(`Bahan dengan ID ${idBahan} tidak ditemukan.`);

      const saldoAwal = parseInt(row.saldo_awal) || 0;
      const keluarAwal= parseInt(row.keluar)     || 0;
      const masuk     = parseInt(row.masuk)      || 0;
      const keluarBaru= keluarAwal + jumlah;
      const sisaStok  = saldoAwal + masuk - keluarBaru;
      const statusBaru= sisaStok > 0 ? 'Tersedia' : 'Tidak Tersedia';

      db.prepare('UPDATE bahan SET keluar=?, stok=?, status=? WHERE id=?')
        .run(keluarBaru, sisaStok, statusBaru, idBahan);

      db.prepare(`INSERT INTO barang_keluar
        (id_riwayat, nama_bahan, jumlah, satuan, distribusi, tanggal, pemohon,
         sisa_stok, id_bahan, id_transaksi, petugas, username)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(d.idRiwayat, d.namaBahan, jumlah, d.satuan, d.tujuanLab, d.tanggal,
             d.pemohon, sisaStok, idBahan, d.idTransaksi, d.petugas, d.username || 'admin');
    });
    txn();
    res.json(getAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/hapusTransaksi', authenticate, requireMaster, (req, res) => {
  try {
    const idTrx = (req.body.args ? req.body.args[0] : req.body.idTrx || '').toString().trim();
    if (!idTrx || idTrx === '-') {
      return res.status(400).json({
        error: 'PENGHAPUSAN DITOLAK: Data ini belum memiliki ID. Sinkronkan stok terlebih dahulu.'
      });
    }
    const txn = db.transaction(() => {
      const items = db.prepare('SELECT * FROM barang_keluar WHERE id_transaksi = ?').all(idTrx);
      if (items.length === 0) throw new Error('Transaksi tidak ditemukan.');
      for (const it of items) {
        const row = db.prepare('SELECT * FROM bahan WHERE id = ?').get(it.id_bahan);
        if (!row) continue;
        const saldoAwal = parseInt(row.saldo_awal) || 0;
        const keluarAwal= parseInt(row.keluar)     || 0;
        const masuk     = parseInt(row.masuk)      || 0;
        const jumlah    = parseInt(it.jumlah)      || 0;
        const keluarBaru= keluarAwal - jumlah;
        const sisaStok  = saldoAwal + masuk - keluarBaru;
        const statusBaru= sisaStok > 0 ? 'Tersedia' : 'Tidak Tersedia';
        db.prepare('UPDATE bahan SET keluar=?, stok=?, status=? WHERE id=?')
          .run(keluarBaru, sisaStok, statusBaru, it.id_bahan);
      }
      db.prepare('DELETE FROM barang_keluar WHERE id_transaksi = ?').run(idTrx);
    });
    txn();
    res.json(getAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// API: PERMINTAAN (APPROVAL WORKFLOW)
// ============================================================
function requireStaffOrMaster(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated.' });
  if (req.user.role !== 'Master' && req.user.role !== 'Staff') {
    return res.status(403).json({ error: 'Hanya Staff atau Master yang bisa melakukan ini.' });
  }
  next();
}

// Staff membuat permintaan baru (item masuk Pending)
app.post('/api/buatPermintaan', authenticate, requireStaffOrMaster, (req, res) => {
  try {
    const d = req.body.args ? req.body.args[0] : req.body;
    const items = d.items || [];
    if (!items || items.length === 0) return res.status(400).json({ error: 'Permintaan minimal berisi 1 item.' });

    const txn = db.transaction(() => {
      // Buat nomor permintaan: REQ-YYYYMMDD-XXX
      const today = new Date();
      const ymd = today.getFullYear().toString() +
                  (today.getMonth() + 1).toString().padStart(2, '0') +
                  today.getDate().toString().padStart(2, '0');
      const countToday = db.prepare("SELECT COUNT(*) AS c FROM permintaan WHERE nomor LIKE ?").get('REQ-' + ymd + '-%').c;
      const nomor = 'REQ-' + ymd + '-' + String(countToday + 1).padStart(3, '0');

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      const pemohonNama = user ? (user.nama_lengkap || user.username) : req.user.nama;
      const pemohonUsername = user ? user.username : req.user.username;

      const info = db.prepare(`INSERT INTO permintaan
        (nomor, pemohon_id, pemohon_nama, pemohon_username, distribusi, status, catatan)
        VALUES (?,?,?,?,?,?,?)`)
        .run(nomor, req.user.id, pemohonNama, pemohonUsername, d.distribusi || '', 'Pending', d.catatan || '');
      const permintaanId = info.lastInsertRowid;

      const insItem = db.prepare(`INSERT INTO permintaan_item
        (permintaan_id, id_bahan, nama_bahan, jumlah_diminta, satuan)
        VALUES (?,?,?,?,?)`);
      items.forEach(it => {
        insItem.run(permintaanId, it.idBahan, it.namaBahan, parseInt(it.jumlah) || 0, it.satuan || '');
      });
    });
    txn();
    res.json(getAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Staff lihat permintaan miliknya sendiri
app.post('/api/permintaanSaya', authenticate, requireStaffOrMaster, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM permintaan WHERE pemohon_id = ? ORDER BY id DESC').all(req.user.id);
    res.json(rows.map(r => {
      const itemCount = db.prepare('SELECT COUNT(*) AS c FROM permintaan_item WHERE permintaan_id = ?').get(r.id).c;
      return {
        id: r.id,
        nomor: r.nomor,
        pemohonNama: r.pemohon_nama,
        distribusi: r.distribusi,
        status: r.status,
        catatan: r.catatan,
        alasanPenolakan: r.alasan_penolakan,
        disetujuiOleh: r.disetujui_oleh,
        disetujuiAt: r.disetujui_at,
        dibuatAt: r.dibuat_at,
        jumlahItem: itemCount
      };
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Master lihat semua permintaan
app.post('/api/semuaPermintaan', authenticate, requireMaster, (req, res) => {
  try {
    const filter = (req.body.args ? req.body.args[0] : req.body.status) || 'semua';
    let rows;
    if (filter === 'semua' || !filter) {
      rows = db.prepare('SELECT * FROM permintaan ORDER BY id DESC').all();
    } else {
      rows = db.prepare('SELECT * FROM permintaan WHERE status = ? ORDER BY id DESC').all(filter);
    }
    res.json(rows.map(r => {
      const itemCount = db.prepare('SELECT COUNT(*) AS c FROM permintaan_item WHERE permintaan_id = ?').get(r.id).c;
      return {
        id: r.id,
        nomor: r.nomor,
        pemohonNama: r.pemohon_nama,
        pemohonUsername: r.pemohon_username,
        distribusi: r.distribusi,
        status: r.status,
        catatan: r.catatan,
        alasanPenolakan: r.alasan_penolakan,
        disetujuiOleh: r.disetujui_oleh,
        disetujuiAt: r.disetujui_at,
        dibuatAt: r.dibuat_at,
        jumlahItem: itemCount
      };
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Detail permintaan + item-itemnya
app.post('/api/detailPermintaan', authenticate, requireStaffOrMaster, (req, res) => {
  try {
    const id = req.body.args ? req.body.args[0] : req.body.id;
    if (!id) return res.status(400).json({ error: 'ID permintaan wajib.' });
    const perm = db.prepare('SELECT * FROM permintaan WHERE id = ?').get(id);
    if (!perm) return res.status(404).json({ error: 'Permintaan tidak ditemukan.' });
    // Staff hanya boleh lihat permintaan miliknya
    if (req.user.role === 'Staff' && perm.pemohon_id !== req.user.id) {
      return res.status(403).json({ error: 'Anda tidak punya akses ke permintaan ini.' });
    }
    const items = db.prepare('SELECT * FROM permintaan_item WHERE permintaan_id = ? ORDER BY id ASC').all(id);
    res.json({
      permintaan: {
        id: perm.id,
        nomor: perm.nomor,
        pemohonId: perm.pemohon_id,
        pemohonNama: perm.pemohon_nama,
        pemohonUsername: perm.pemohon_username,
        distribusi: perm.distribusi,
        status: perm.status,
        catatan: perm.catatan,
        alasanPenolakan: perm.alasan_penolakan,
        disetujuiOleh: perm.disetujui_oleh,
        disetujuiAt: perm.disetujui_at,
        dibuatAt: perm.dibuat_at
      },
      items: items.map(it => ({
        id: it.id,
        permintaanId: it.permintaan_id,
        idBahan: it.id_bahan,
        namaBahan: it.nama_bahan,
        jumlahDiminta: it.jumlah_diminta,
        jumlahDisetujui: it.jumlah_disetujui,
        satuan: it.satuan
      }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Master memproses permintaan: setujui (dengan edit jumlah_disetujui) / tolak
app.post('/api/prosesPermintaan', authenticate, requireMaster, (req, res) => {
  try {
    const d = req.body.args ? req.body.args[0] : req.body;
    const permintaanId = parseInt(d.id);
    const aksi = d.aksi || 'setujui'; // 'setujui' | 'tolak'
    const items = d.items || []; // [{id, jumlahDisetujui}]
    const alasan = d.alasanPenolakan || '';

    if (!permintaanId) return res.status(400).json({ error: 'ID permintaan wajib.' });

    const perm = db.prepare('SELECT * FROM permintaan WHERE id = ?').get(permintaanId);
    if (!perm) return res.status(404).json({ error: 'Permintaan tidak ditemukan.' });
    if (perm.status !== 'Pending') return res.status(400).json({ error: 'Permintaan sudah diproses sebelumnya.' });

    const txn = db.transaction(() => {
      if (aksi === 'tolak') {
        db.prepare(`UPDATE permintaan SET status='Ditolak', alasan_penolakan=?, disetujui_oleh=?, disetujui_at=datetime('now') WHERE id=?`)
          .run(alasan, req.user.username, permintaanId);
        return;
      }

      // Aksi: setujui
      // Update jumlah_disetujui per item
      const allItems = db.prepare('SELECT * FROM permintaan_item WHERE permintaan_id = ?').all(permintaanId);
      const idTrx = 'TRX-' + Date.now();
      const now = new Date();
      const fmtDate = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0') + '-' + now.getDate().toString().padStart(2, '0') + ' ' + now.getHours() + ':' + now.getMinutes().toString().padStart(2, '0');

      const updItem = db.prepare('UPDATE permintaan_item SET jumlah_disetujui=? WHERE id=?');
      const insBk = db.prepare(`INSERT INTO barang_keluar
        (id_riwayat, nama_bahan, jumlah, satuan, distribusi, tanggal, pemohon, sisa_stok, id_bahan, id_transaksi, petugas, username, permintaan_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

      let idx = 0;
      allItems.forEach(it => {
        // Cari jumlah disetujui dari payload, default = jumlah diminta
        let jmlDisetujui = parseInt(it.jumlah_diminta) || 0;
        const payloadItem = items.find(x => String(x.id) === String(it.id));
        if (payloadItem) jmlDisetujui = parseInt(payloadItem.jumlahDisetujui) || 0;
        if (jmlDisetujui < 0) jmlDisetujui = 0;

        updItem.run(jmlDisetujui, it.id);

        // Hanya catat ke barang_keluar & kurangi stok jika jumlah_disetujui > 0
        if (jmlDisetujui > 0) {
          const bahan = db.prepare('SELECT * FROM bahan WHERE id = ?').get(it.id_bahan);
          let sisaStok = 0;
          if (bahan) {
            const saldoAwal = parseInt(bahan.saldo_awal) || 0;
            const keluarAwal = parseInt(bahan.keluar) || 0;
            const masuk = parseInt(bahan.masuk) || 0;
            const keluarBaru = keluarAwal + jmlDisetujui;
            sisaStok = saldoAwal + masuk - keluarBaru;
            const statusBaru = sisaStok > 0 ? 'Tersedia' : 'Tidak Tersedia';
            db.prepare('UPDATE bahan SET keluar=?, stok=?, status=? WHERE id=?')
              .run(keluarBaru, sisaStok, statusBaru, it.id_bahan);
          }
          const idRiwayat = 'OUT-' + Date.now().toString().slice(-5) + idx;
          insBk.run(
            idRiwayat,
            it.nama_bahan,
            jmlDisetujui,
            it.satuan,
            perm.distribusi,
            fmtDate,
            perm.pemohon_nama,
            sisaStok,
            it.id_bahan,
            idTrx,
            req.user.nama,
            perm.pemohon_username,
            permintaanId
          );
          idx++;
        }
      });

      db.prepare(`UPDATE permintaan SET status='Disetujui', disetujui_oleh=?, disetujui_at=datetime('now') WHERE id=?`)
        .run(req.user.username, permintaanId);
    });
    txn();
    res.json(getAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// API: SETTINGS
// ============================================================
app.post('/api/saveSetting', authenticate, requireMaster, (req, res) => {
  try {
    const d = req.body.args ? req.body.args[0] : req.body;
    const exists = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(d.key);
    if (exists) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(d.value, d.key);
    else        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(d.key, d.value);
    res.json(getAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/savePengaturanTtd', authenticate, requireMaster, (req, res) => {
  try {
    const args = req.body.args || [];
    const [jabatan, nama, nip] = args;
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    upsert.run('ttd_jabatan', jabatan);
    upsert.run('ttd_nama',    nama);
    upsert.run('ttd_nip',     nip);
    res.json(getAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// API: SYNC STOK
// ============================================================
app.post('/api/syncDatabaseStok', authenticate, requireMaster, (req, res) => {
  try {
    const txn = db.transaction(() => {
      const out = db.prepare('SELECT * FROM barang_keluar').all();
      const rekap = {};
      out.forEach((r, i) => {
        let idRiwayat   = r.id_riwayat;
        let idTransaksi = r.id_transaksi;
        if (!idRiwayat   || idRiwayat.toString().trim()   === '' || idRiwayat === '-') {
          idRiwayat = 'OUT-' + Date.now().toString().slice(-5) + i;
          db.prepare('UPDATE barang_keluar SET id_riwayat = ? WHERE id = ?').run(idRiwayat, r.id);
        }
        if (!idTransaksi || idTransaksi.toString().trim() === '' || idTransaksi === '-') {
          idTransaksi = 'TRX-MANUAL-' + Date.now().toString().slice(-5) + i;
          db.prepare('UPDATE barang_keluar SET id_transaksi = ? WHERE id_riwayat = ?').run(idTransaksi, idRiwayat);
        }
        if (r.id_bahan) {
          rekap[r.id_bahan] = (rekap[r.id_bahan] || 0) + (parseInt(r.jumlah) || 0);
        }
      });

      const allBahan = db.prepare('SELECT * FROM bahan').all();
      allBahan.forEach(b => {
        const saldoAwal = parseInt(b.saldo_awal) || 0;
        const masuk     = parseInt(b.masuk)      || 0;
        const keluar    = rekap[b.id] || 0;
        const stok      = saldoAwal + masuk - keluar;
        const status    = stok > 0 ? 'Tersedia' : 'Tidak Tersedia';
        db.prepare('UPDATE bahan SET keluar=?, stok=?, status=? WHERE id=?')
          .run(keluar, stok, status, b.id);
      });
    });
    txn();
    res.json(getAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// API: PROFILE (semua role bisa update data sendiri)
// ============================================================
app.post('/api/updateProfil', authenticate, (req, res) => {
  try {
    const args = req.body.args || [];
    const [namaLengkap, password] = args;
    if (namaLengkap) {
      db.prepare('UPDATE users SET nama_lengkap=? WHERE id=?').run(namaLengkap, req.user.id);
    }
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.user.id);
    }
    // Return updated user info
    const user = db.prepare('SELECT id, username, role, nama_lengkap FROM users WHERE id=?').get(req.user.id);
    res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, nama: user.nama_lengkap } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// API: USER MANAGEMENT (Master only)
// ============================================================
app.post('/api/users', authenticate, requireMaster, (req, res) => {
  try {
    const rows = db.prepare('SELECT id, username, role, nama_lengkap, permissions, created_at FROM users ORDER BY id').all();
    res.json(rows.map(r => ({ ...r, permissions: JSON.parse(r.permissions || '[]') })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/createUser', authenticate, requireMaster, (req, res) => {
  try {
    const args = req.body.args || [];
    const [username, password, role, namaLengkap, permissions] = args;
    if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib.' });
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, password_hash, role, nama_lengkap, permissions) VALUES (?,?,?,?,?)')
      .run(username, hash, role || 'Tamu', namaLengkap || username, JSON.stringify(permissions || []));
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username sudah digunakan.' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/updateUser', authenticate, requireMaster, (req, res) => {
  try {
    const args = req.body.args || [];
    const [id, username, password, role, namaLengkap, permissions] = args;
    if (!id) return res.status(400).json({ error: 'ID user wajib.' });
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET username=?, password_hash=?, role=?, nama_lengkap=?, permissions=? WHERE id=?')
        .run(username, hash, role, namaLengkap, JSON.stringify(permissions || []), id);
    } else {
      db.prepare('UPDATE users SET username=?, role=?, nama_lengkap=?, permissions=? WHERE id=?')
        .run(username, role, namaLengkap, JSON.stringify(permissions || []), id);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/deleteUser', authenticate, requireMaster, (req, res) => {
  try {
    const args = req.body.args || [];
    const [id] = args;
    if (!id) return res.status(400).json({ error: 'ID user wajib.' });
    const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'User tidak ditemukan.' });
    if (target.role === 'Master') return res.status(400).json({ error: 'Tidak bisa menghapus user Master.' });
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// API: BATCH IMPORT
// ============================================================
app.post('/api/saveBahanBatch', authenticate, requireMaster, (req, res) => {
  try {
    const items = req.body.args ? req.body.args[0] : req.body.items;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Tidak ada data yang dikirim.' });

    const TAHUN_INI = new Date().getFullYear().toString();
    const txn = db.transaction(() => {
      const insert = db.prepare(`INSERT INTO bahan
        (id, nama_bahan, saldo_awal, lokasi, keluar, masuk, stok, satuan, keterangan, status, tahun, inden, catatan)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

      for (const d of items) {
        if (!d.id || !d.namaBahan) throw new Error('ID dan Nama Bahan wajib diisi untuk semua item.');
        const exists = db.prepare('SELECT 1 FROM bahan WHERE id = ?').get(d.id);
        if (exists) throw new Error(`ID Bahan '${d.id}' sudah ada! Hapus atau ganti ID terlebih dahulu.`);

        const saldoAwal = parseInt(d.saldoAwal) || 0;
        const masuk     = parseInt(d.masuk)     || 0;
        const keluar    = parseInt(d.keluar)    || 0;
        const stok      = saldoAwal + masuk - keluar;
        const status    = stok > 0 ? 'Tersedia' : 'Tidak Tersedia';

        insert.run(d.id, d.namaBahan, saldoAwal, d.lokasi || '', keluar, masuk, stok,
          d.satuan || '', d.keterangan || '', status, d.tahun || TAHUN_INI,
          d.inden || 'Tidak', d.catatan || '');
      }
    });
    txn();
    res.json(getAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/saveBarangKeluarBatch', authenticate, requireMaster, (req, res) => {
  try {
    const items = req.body.args ? req.body.args[0] : req.body.items;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Tidak ada data yang dikirim.' });

    const txn = db.transaction(() => {
      const insert = db.prepare(`INSERT INTO barang_keluar
        (id_riwayat, nama_bahan, jumlah, satuan, distribusi, tanggal, pemohon,
         sisa_stok, id_bahan, id_transaksi, petugas, username)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);

      for (const d of items) {
        const jumlah = parseInt(d.jumlah) || 0;
        const idBahan = d.idBahan || '';

        let sisaStok = 0;
        if (idBahan) {
          const row = db.prepare('SELECT * FROM bahan WHERE id = ?').get(idBahan);
          if (!row) throw new Error(`Bahan dengan ID '${idBahan}' tidak ditemukan.`);

          const saldoAwal = parseInt(row.saldo_awal) || 0;
          const keluarAwal = parseInt(row.keluar) || 0;
          const masuk = parseInt(row.masuk) || 0;
          const keluarBaru = keluarAwal + jumlah;
          sisaStok = saldoAwal + masuk - keluarBaru;
          const statusBaru = sisaStok > 0 ? 'Tersedia' : 'Tidak Tersedia';

          db.prepare('UPDATE bahan SET keluar=?, stok=?, status=? WHERE id=?')
            .run(keluarBaru, sisaStok, statusBaru, idBahan);
        }

        insert.run(
          d.idRiwayat || 'OUT-' + Date.now().toString().slice(-4),
          d.namaBahan || '', jumlah, d.satuan || '', d.distribusi || d.tujuanLab || '',
          d.tanggal || '', d.pemohon || '', sisaStok, idBahan,
          d.idTransaksi || '', d.petugas || '', d.username || 'admin'
        );
      }
    });
    txn();
    res.json(getAll());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ============================================================
// 404
// ============================================================
app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(` Dragon Machine Server`);
  console.log(` Berjalan di http://localhost:${PORT}`);
  console.log(` Mode: AUTH (login required)`);
  console.log(`========================================\n`);
});
