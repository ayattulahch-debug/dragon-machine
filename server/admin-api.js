const express = require('express');
const { db } = require('./db');

const router = express.Router();

router.post('/tables', (req, res) => {
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const result = tables.map(t => {
      const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get().c;
      const columns = db.prepare(`PRAGMA table_info("${t.name}")`).all().map(c => ({
        name: c.name,
        type: c.type,
        notnull: !!c.notnull,
        pk: !!c.pk,
        dflt_value: c.dflt_value
      }));
      return { name: t.name, rows: count, columns };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/table/:name', (req, res) => {
  try {
    const tableName = req.params.name;
    const safeTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
    if (!safeTables.includes(tableName)) {
      return res.status(400).json({ error: 'Tabel tidak ditemukan.' });
    }

    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 50;
    const search = req.body.search || '';
    const searchColumn = req.body.searchColumn || '';
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];
    if (search && searchColumn) {
      whereClause = `WHERE "${searchColumn}" LIKE ?`;
      params.push(`%${search}%`);
    } else if (search) {
      const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all();
      const conditions = columns.map(c => `"${c.name}" LIKE ?`).join(' OR ');
      whereClause = `WHERE ${conditions}`;
      params = columns.map(() => `%${search}%`);
    }

    const totalResult = db.prepare(`SELECT COUNT(*) as c FROM "${tableName}" ${whereClause}`).get(...params);
    const total = totalResult.c;
    const totalPages = Math.ceil(total / limit);

    const rows = db.prepare(`SELECT * FROM "${tableName}" ${whereClause} ORDER BY rowid DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all().map(c => ({
      name: c.name,
      type: c.type,
      notnull: !!c.notnull,
      pk: !!c.pk,
      dflt_value: c.dflt_value
    }));

    res.json({ rows, columns, total, page, limit, totalPages });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/query', (req, res) => {
  try {
    const sql = (req.body.sql || '').trim();
    if (!sql) return res.status(400).json({ error: 'SQL query kosong.' });

    const upperSql = sql.toUpperCase().trim();
    const isSelect = upperSql.startsWith('SELECT') || upperSql.startsWith('PRAGMA') || upperSql.startsWith('EXPLAIN');
    if (!isSelect) {
      return res.status(400).json({ error: 'Hanya query SELECT/PRAGMA yang diizinkan di sini. Gunakan tabel editor untuk INSERT/UPDATE/DELETE.' });
    }

    if (upperSql.includes('DROP') || upperSql.includes('ALTER TABLE users')) {
      return res.status(400).json({ error: 'Query tidak diizinkan.' });
    }

    const rows = db.prepare(sql).all();
    res.json({ rows, count: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/row/update', (req, res) => {
  try {
    const { table, column, value, pkColumn, pkValue } = req.body;
    if (!table || !column || !pkColumn) return res.status(400).json({ error: 'Parameter tidak lengkap.' });

    const safeTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
    if (!safeTables.includes(table)) return res.status(400).json({ error: 'Tabel tidak ditemukan.' });

    db.prepare(`UPDATE "${table}" SET "${column}" = ? WHERE "${pkColumn}" = ?`).run(value, pkValue);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/row/insert', (req, res) => {
  try {
    const { table, data } = req.body;
    if (!table || !data || typeof data !== 'object') return res.status(400).json({ error: 'Parameter tidak lengkap.' });

    const safeTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
    if (!safeTables.includes(table)) return res.status(400).json({ error: 'Tabel tidak ditemukan.' });

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    const colNames = columns.map(c => `"${c}"`).join(', ');

    db.prepare(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`).run(...values);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/row/delete', (req, res) => {
  try {
    const { table, pkColumn, pkValue } = req.body;
    if (!table || !pkColumn) return res.status(400).json({ error: 'Parameter tidak lengkap.' });

    const safeTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
    if (!safeTables.includes(table)) return res.status(400).json({ error: 'Tabel tidak ditemukan.' });

    if (table === 'users') {
      const target = db.prepare('SELECT role FROM users WHERE id = ?').get(pkValue);
      if (target && target.role === 'Master') {
        const masterCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'Master'").get().c;
        if (masterCount <= 1) {
          return res.status(400).json({ error: 'Tidak bisa menghapus satu-satunya user Master.' });
        }
      }
    }

    db.prepare(`DELETE FROM "${table}" WHERE "${pkColumn}" = ?`).run(pkValue);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/row/delete-batch', (req, res) => {
  try {
    const { table, pkColumn, pkValues } = req.body;
    if (!table || !pkColumn || !Array.isArray(pkValues) || pkValues.length === 0) {
      return res.status(400).json({ error: 'Parameter tidak lengkap.' });
    }

    const safeTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
    if (!safeTables.includes(table)) return res.status(400).json({ error: 'Tabel tidak ditemukan.' });

    const placeholders = pkValues.map(() => '?').join(', ');
    db.prepare(`DELETE FROM "${table}" WHERE "${pkColumn}" IN (${placeholders})`).run(...pkValues);
    res.json({ success: true, deleted: pkValues.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;