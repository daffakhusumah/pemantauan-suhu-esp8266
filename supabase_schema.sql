-- ============================================================
-- Schema Supabase — Pemantauan Suhu
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Buat tabel utama
CREATE TABLE IF NOT EXISTS sensor_readings (
  id         BIGSERIAL PRIMARY KEY,
  suhu       FLOAT        NOT NULL,
  humid      FLOAT        NOT NULL,
  device     TEXT         NOT NULL DEFAULT 'ESP8266-DHT11',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Index untuk query cepat (ambil data terbaru)
CREATE INDEX IF NOT EXISTS idx_sensor_readings_created_at
  ON sensor_readings (created_at DESC);

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;

-- 4. Policy: siapa saja bisa SELECT (baca dashboard)
CREATE POLICY "Allow public read"
  ON sensor_readings
  FOR SELECT
  USING (true);

-- 5. Policy: hanya Service Role Key yang bisa INSERT (dari API Vercel)
--    (Service Role Key tidak pernah diekspos ke browser)
CREATE POLICY "Allow service role insert"
  ON sensor_readings
  FOR INSERT
  WITH CHECK (true);

-- 6. (Opsional) Auto-hapus data lama setelah 7 hari agar tidak penuh
-- Jalankan sekali, atau buat scheduled job di Supabase:
-- DELETE FROM sensor_readings WHERE created_at < NOW() - INTERVAL '7 days';

-- ── Verifikasi ────────────────────────────────────────────────────────────
-- Setelah menjalankan query di atas, cek dengan:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'sensor_readings';
-- Harus return 1 baris: sensor_readings

-- ============================================================
-- 7. TABEL LAPORAN HARIAN (PERMANEN 30 TAHUN)
-- ============================================================
CREATE TABLE IF NOT EXISTS laporan_harian (
  id            BIGSERIAL PRIMARY KEY,
  tanggal       DATE NOT NULL UNIQUE,
  waktu_pagi    TEXT,
  suhu_pagi     NUMERIC(4,1),
  humid_pagi    NUMERIC(4,1),
  status_pagi   TEXT,
  waktu_malam   TEXT,
  suhu_malam    NUMERIC(4,1),
  humid_malam   NUMERIC(4,1),
  status_malam  TEXT,
  avg_suhu      NUMERIC(4,1),
  min_suhu      NUMERIC(4,1),
  max_suhu      NUMERIC(4,1),
  avg_humid     NUMERIC(4,1),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_laporan_harian_tanggal ON laporan_harian (tanggal DESC);
ALTER TABLE laporan_harian ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read laporan_harian" ON laporan_harian FOR SELECT USING (true);
CREATE POLICY "Allow service role all laporan_harian" ON laporan_harian FOR ALL USING (true) WITH CHECK (true);

