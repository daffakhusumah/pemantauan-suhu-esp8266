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
