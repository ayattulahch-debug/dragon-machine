const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'dragon.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// SCHEMA
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Master','Staff','Tamu')),
    nama_lengkap TEXT,
    permissions TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrasi: tambah kolom permissions jika belum ada
try { db.exec("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]'"); } catch (e) { /* sudah ada */ }

db.exec(`

  CREATE TABLE IF NOT EXISTS bahan (
    id TEXT PRIMARY KEY,
    nama_bahan TEXT NOT NULL,
    saldo_awal INTEGER DEFAULT 0,
    lokasi TEXT,
    keluar INTEGER DEFAULT 0,
    masuk INTEGER DEFAULT 0,
    stok INTEGER DEFAULT 0,
    satuan TEXT,
    keterangan TEXT,
    status TEXT,
    tahun TEXT,
    inden TEXT,
    catatan TEXT
  );

  CREATE TABLE IF NOT EXISTS barang_keluar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_riwayat TEXT,
    nama_bahan TEXT,
    jumlah INTEGER,
    satuan TEXT,
    distribusi TEXT,
    tanggal TEXT,
    pemohon TEXT,
    sisa_stok INTEGER,
    id_bahan TEXT,
    id_transaksi TEXT,
    petugas TEXT,
    username TEXT,
    permintaan_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_bk_idtrx ON barang_keluar(id_transaksi);
  CREATE INDEX IF NOT EXISTS idx_bk_idbahan ON barang_keluar(id_bahan);
`);

// Migrasi: tambah kolom permintaan_id di barang_keluar jika belum ada
try { db.exec("ALTER TABLE barang_keluar ADD COLUMN permintaan_id INTEGER"); } catch (e) { /* sudah ada */ }

// Index dibuat SETELAH ALTER TABLE agar kolom permintaan_id sudah ada
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_bk_permintaan ON barang_keluar(permintaan_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS permintaan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nomor TEXT UNIQUE NOT NULL,
    pemohon_id INTEGER NOT NULL,
    pemohon_nama TEXT NOT NULL,
    pemohon_username TEXT NOT NULL,
    distribusi TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    catatan TEXT,
    alasan_penolakan TEXT,
    disetujui_oleh TEXT,
    disetujui_at TEXT,
    dibuat_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (pemohon_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_perm_status ON permintaan(status);
  CREATE INDEX IF NOT EXISTS idx_perm_pemohon ON permintaan(pemohon_id);

  CREATE TABLE IF NOT EXISTS permintaan_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    permintaan_id INTEGER NOT NULL,
    id_bahan TEXT NOT NULL,
    nama_bahan TEXT NOT NULL,
    jumlah_diminta INTEGER NOT NULL,
    jumlah_disetujui INTEGER,
    satuan TEXT,
    FOREIGN KEY (permintaan_id) REFERENCES permintaan(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pitem_perm ON permintaan_item(permintaan_id);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Hapus tabel barang_masuk lama jika masih ada (fitur PO dihapus)
try { db.exec("DROP TABLE IF EXISTS barang_masuk"); } catch (e) { /* ignore */ }

// ============================================================
// INITIAL SEED
// ============================================================
function ensureSeed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const adminName = process.env.ADMIN_NAME || 'Administrator';
    const staffUser = process.env.STAFF_USERNAME || 'staff';
    const staffPass = process.env.STAFF_PASSWORD || 'staff123';
    const staffName = process.env.STAFF_NAME || 'Staff Gudang';
    const tamuUser  = process.env.TAMU_USERNAME  || 'tamu';
    const tamuPass  = process.env.TAMU_PASSWORD  || 'tamu123';
    const tamuName  = process.env.TAMU_NAME      || 'User Tamu';

    const insert = db.prepare(
      'INSERT INTO users (username, password_hash, role, nama_lengkap) VALUES (?, ?, ?, ?)'
    );
    insert.run(adminUser, bcrypt.hashSync(adminPass, 10), 'Master', adminName);
    insert.run(staffUser, bcrypt.hashSync(staffPass, 10), 'Staff', staffName);
    insert.run(tamuUser,  bcrypt.hashSync(tamuPass, 10), 'Tamu',  tamuName);
    // Seed 10 Lab Staff
    var labs = [
      ['lab_farmakologi', 'lab123', 'Staff', 'apt. Siti Rahmawati'],
      ['lab_farmasetika', 'lab123', 'Staff', 'apt. Andi Pratama'],
      ['lab_r_instrumen', 'lab123', 'Staff', 'Dewi Lestari'],
      ['lab_farmakognosi', 'lab123', 'Staff', 'Budi Santoso'],
      ['lab_kimia_dasar', 'lab123', 'Staff', 'Rina Kurniawati'],
      ['lab_mikrobiologi', 'lab123', 'Staff', 'Fitri Amelia'],
      ['lab_biokimia', 'lab123', 'Staff', 'Rudi Hartono'],
      ['lab_fisiologi', 'lab123', 'Staff', 'Dr. Joko Susilo'],
      ['lab_kromatografi', 'lab123', 'Staff', 'Budi Prasetyo'],
      ['lab_penelitian', 'lab123', 'Staff', 'Nina Wulandari'],
    ];
    labs.forEach(function(l) {
      insert.run(l[0], bcrypt.hashSync(l[1], 10), l[2], l[3]);
    });
    console.log(`[db] User seed: ${adminUser}/${adminPass} (Master), ${staffUser}/${staffPass} (Staff), ${tamuUser}/${tamuPass} (Tamu) + 10 lab`);
  }

  const setCount = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (setCount === 0) {
    const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insert.run('logo_instansi', '');
    insert.run('ttd_jabatan', 'Penanggung Jawab Gudang');
    insert.run('ttd_nama', 'Aji Ayattulah Chomaini');
    insert.run('ttd_nip', '199412242025211057');
    console.log('[db] Settings seed dibuat');
  }

  const bahanCount = db.prepare('SELECT COUNT(*) AS c FROM bahan').get().c;
  if (bahanCount === 0) {
    const ins = db.prepare(`INSERT INTO bahan
      (id, nama_bahan, saldo_awal, lokasi, keluar, masuk, stok, satuan, keterangan, status, tahun, inden, catatan)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const bahanData = [
      ['B-001','Asam Sulfat (H₂SO₄) 98%',50,'Lemari Asam A1',0,0,50,'Liter','Bahan baku praktikum kimia','Tersedia','2026','Tidak','Simpan di lemari asam terpisah'],
      ['B-002','Etanol 96%',30,'Rak Cairan C3',0,0,30,'Botol','Pelarut organik mudah terbakar','Tersedia','2026','Tidak','Jauhkan dari sumber api'],
      ['B-003','Natrium Klorida (NaCl)',100,'Rak Padat P1',0,0,100,'Gram','Bahan baku reagen fisiologis','Tersedia','2026','Tidak','-'],
      ['B-004','Metanol',25,'Rak Cairan C2',0,0,25,'Liter','Pelarut kromatografi','Tersedia','2026','Ya','Stok terbatas, gunakan sesuai prosedur'],
      ['B-005','Akuades',200,'Rak Cairan C1',0,0,200,'Liter','Air murni untuk semua keperluan lab','Tersedia','2026','Tidak','-'],
      ['B-006','Tabung Reaksi Kaca 10ml',100,'Rak Alat A2',0,0,100,'Pcs','Alat gelas laboratorium','Tersedia','2026','Tidak','Simpan dalam posisi tegak'],
      ['B-007','Kertas Saring Whatman No.1',20,'Laci L1',0,0,20,'Box','Penyaringan kualitatif','Tersedia','2026','Tidak','Hindari tempat lembab'],
      ['B-008','Pipet Ukur 10ml',15,'Laci Alat A1',0,0,15,'Pcs','Alat ukur volume cairan','Tersedia','2025','Tidak','Kalibrasi berkala'],
      ['B-009','Sediaan Parasetamol 500mg',500,'Rak Padat P2',0,0,500,'Tablet','Obat praktikum farmasi','Tersedia','2026','Tidak','Simpan di suhu ruang'],
      ['B-010','Indikator pH Universal',5,'Rak Reagen R1',0,0,5,'Pack','Indikator pH untuk analisa','Tersedia','2026','Tidak','-'],
    ];
    bahanData.forEach(r => ins.run(...r));
    console.log('[db] 10 bahan seed dibuat');
  }

  const bkCount = db.prepare('SELECT COUNT(*) AS c FROM barang_keluar').get().c;
  if (bkCount === 0) {
    const ins = db.prepare(`INSERT INTO barang_keluar
      (id_riwayat, nama_bahan, jumlah, satuan, distribusi, tanggal, pemohon, sisa_stok, id_bahan, id_transaksi, petugas, username)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const bkData = [
      ['OUT-001','Asam Sulfat (H₂SO₄) 98%',2,'Liter','Lab Kimia Organik','2026-05-10','Dr. Bambang',48,'B-001','TRX-001','Admin','admin'],
      ['OUT-002','Etanol 96%',5,'Botol','Lab Farmakologi','2026-05-11','apt. Siti',25,'B-002','TRX-002','Admin','admin'],
      ['OUT-003','Akuades',20,'Liter','Lab Kimia Dasar','2026-05-12','Rina K.',180,'B-005','TRX-003','Admin','admin'],
      ['OUT-004','Parasetamol 500mg',100,'Tablet','Lab Farmasetika','2026-05-13','Andi S.',400,'B-009','TRX-004','Admin','admin'],
      ['OUT-005','Tabung Reaksi Kaca 10ml',10,'Pcs','Lab Kimia Analitik','2026-05-14','Dewi L.',90,'B-006','TRX-005','Admin','admin'],
      ['OUT-006','Metanol',3,'Liter','Lab Kromatografi','2026-05-15','Budi P.',22,'B-004','TRX-006','Admin','admin'],
      ['OUT-007','Kertas Saring Whatman No.1',2,'Box','Lab Mikrobiologi','2026-05-16','Fitri A.',18,'B-007','TRX-007','Admin','admin'],
      ['OUT-008','Natrium Klorida (NaCl)',25,'Gram','Lab Fisiologi','2026-05-17','Dr. Joko',75,'B-003','TRX-008','Admin','admin'],
      ['OUT-009','Pipet Ukur 10ml',3,'Pcs','Lab Kimia Analitik','2026-05-18','Nina W.',12,'B-008','TRX-009','Admin','admin'],
      ['OUT-010','Indikator pH Universal',1,'Pack','Lab Biokimia','2026-05-19','Rudi H.',4,'B-010','TRX-010','Admin','admin'],
    ];
    bkData.forEach(r => {
      const [id_riwayat, nama_bahan, jumlah, satuan, distribusi, tanggal, pemohon, sisa_stok, id_bahan, id_transaksi, petugas, username] = r;
      ins.run(id_riwayat, nama_bahan, jumlah, satuan, distribusi, tanggal, pemohon, sisa_stok, id_bahan, id_transaksi, petugas, username);
      // Update stok bahan sesuai barang keluar
      const bahan = db.prepare('SELECT * FROM bahan WHERE id = ?').get(id_bahan);
      if (bahan) {
        const kelBaru = (parseInt(bahan.keluar) || 0) + parseInt(jumlah);
        const stokBaru = (parseInt(bahan.saldo_awal) || 0) + (parseInt(bahan.masuk) || 0) - kelBaru;
        const statusBaru = stokBaru > 0 ? 'Tersedia' : 'Tidak Tersedia';
        db.prepare('UPDATE bahan SET keluar=?, stok=?, status=? WHERE id=?').run(kelBaru, stokBaru, statusBaru, id_bahan);
      }
    });
    console.log('[db] 10 barang_keluar seed dibuat');
  }
}
ensureSeed();

// ============================================================
// DATA CLEANERS (samakan dengan helper Code.gs lama)
// ============================================================
function cleanBahan(row) {
  return {
    id:        row.id        ?? '',
    namaBahan: row.nama_bahan ?? '',
    saldoAwal: row.saldo_awal ?? 0,
    lokasi:    row.lokasi    ?? '',
    keluar:    row.keluar    ?? 0,
    masuk:     row.masuk     ?? 0,
    stok:      row.stok      ?? 0,
    satuan:    row.satuan    ?? '',
    keterangan:row.keterangan?? '',
    status:    row.status    ?? '',
    tahun:     row.tahun     ?? '2026',
    inden:     row.inden     ?? 'Tidak',
    catatan:   row.catatan   ?? ''
  };
}

function cleanBarangKeluar(row) {
  return {
    idRiwayat:   row.id_riwayat  ?? '',
    namaBahan:   row.nama_bahan  ?? '',
    jumlah:      row.jumlah      ?? 0,
    satuan:      row.satuan      ?? '',
    tujuanLab:   row.distribusi  ?? '',
    tanggal:     (row.tanggal    ?? '').toString().replace(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/,
                  (_, y, m, d) => `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`),
    pemohon:     row.pemohon     ?? '',
    stok:        row.sisa_stok   ?? 0,
    idBahan:     row.id_bahan    ?? '',
    idTransaksi: row.id_transaksi?? '',
    petugas:     row.petugas     ?? '',
    username:    row.username    ?? '',
    permintaanId:row.permintaan_id ?? null
  };
}

function cleanPermintaan(row) {
  return {
    id:              row.id              ?? null,
    nomor:           row.nomor           ?? '',
    pemohonId:       row.pemohon_id      ?? null,
    pemohonNama:     row.pemohon_nama    ?? '',
    pemohonUsername: row.pemohon_username?? '',
    distribusi:      row.distribusi      ?? '',
    status:          row.status          ?? 'Pending',
    catatan:         row.catatan         ?? '',
    alasanPenolakan: row.alasan_penolakan?? '',
    disetujuiOleh:   row.disetujui_oleh  ?? '',
    disetujuiAt:     row.disetujui_at    ?? '',
    dibuatAt:        row.dibuat_at       ?? ''
  };
}

function cleanPermintaanItem(row) {
  return {
    id:             row.id             ?? null,
    permintaanId:   row.permintaan_id  ?? null,
    idBahan:        row.id_bahan       ?? '',
    namaBahan:      row.nama_bahan     ?? '',
    jumlahDiminta:  row.jumlah_diminta ?? 0,
    jumlahDisetujui:row.jumlah_disetujui ?? null,
    satuan:         row.satuan         ?? ''
  };
}

function getAll() {
  const bahan       = db.prepare('SELECT * FROM bahan').all().map(cleanBahan);
  const barangKeluar= db.prepare('SELECT * FROM barang_keluar ORDER BY id DESC').all().map(cleanBarangKeluar);

  // Update sisa_stok di barangKeluar dari stok bahan terkini (sama seperti Code.gs)
  barangKeluar.forEach(trx => {
    const b = bahan.find(x => x.id === trx.idBahan);
    if (b) trx.stok = b.stok;
  });

  const permintaanRows = db.prepare('SELECT * FROM permintaan ORDER BY id DESC').all();
  const permintaan = permintaanRows.map(cleanPermintaan);
  const permintaanItemRows = db.prepare('SELECT * FROM permintaan_item ORDER BY id ASC').all();
  const permintaanItem = permintaanItemRows.map(cleanPermintaanItem);

  const settingsRows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  settingsRows.forEach(r => { settings[r.key] = r.value; });

  return { bahan, barangKeluar, permintaan, permintaanItem, settings };
}

module.exports = { db, getAll, cleanBahan, cleanBarangKeluar, cleanPermintaan, cleanPermintaanItem };
