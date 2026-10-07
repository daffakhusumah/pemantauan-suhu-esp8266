-- ==============================================================================
-- SETUP ARSITEKTUR RETENSI & ROLLUP DATA (AMAN UNTUK 30 TAHUN KE DEPAN)
-- RS FATMAWATI — SISTEM PEMANTAUAN SUHU RUANG SERVER
-- ==============================================================================
-- Jalankan script ini di:
-- Supabase Dashboard → SQL Editor → New Query → Klik RUN
-- ==============================================================================

-- 1. Buat Tabel Ringkasan Laporan Harian (Disimpan PERMANEN selama 30+ Tahun)
-- Hanya ~730 baris per tahun, 30 tahun hanya ~21.900 baris (~3 MB)
CREATE TABLE IF NOT EXISTS laporan_harian (
  id            BIGSERIAL PRIMARY KEY,
  tanggal       DATE NOT NULL UNIQUE,
  waktu_pagi    TEXT,               -- Jam pencatatan pagi terdekat 08:00 WIB (misal '08:02')
  suhu_pagi     NUMERIC(4,1),       -- Suhu pagi (°C)
  humid_pagi    NUMERIC(4,1),       -- Kelembaban pagi (%)
  status_pagi   TEXT,               -- '✅ Normal', '⚠️ Perhatian', '🔴 Bahaya'
  waktu_malam   TEXT,               -- Jam pencatatan malam terdekat 20:00 WIB (misal '20:01')
  suhu_malam    NUMERIC(4,1),       -- Suhu malam (°C)
  humid_malam   NUMERIC(4,1),       -- Kelembaban malam (%)
  status_malam  TEXT,               -- '✅ Normal', '⚠️ Perhatian', '🔴 Bahaya'
  avg_suhu      NUMERIC(4,1),       -- Rata-rata suhu 24 jam
  min_suhu      NUMERIC(4,1),       -- Suhu terendah hari itu
  max_suhu      NUMERIC(4,1),       -- Suhu tertinggi hari itu
  avg_humid     NUMERIC(4,1),       -- Rata-rata kelembaban hari itu
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Index untuk pencarian cepat berdasarkan rentang tanggal
CREATE INDEX IF NOT EXISTS idx_laporan_harian_tanggal
  ON laporan_harian (tanggal DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE laporan_harian ENABLE ROW LEVEL SECURITY;

-- Izinkan publik membaca laporan (untuk dashboard & PDF cetak)
DROP POLICY IF EXISTS "Allow public read laporan_harian" ON laporan_harian;
CREATE POLICY "Allow public read laporan_harian"
  ON laporan_harian FOR SELECT
  USING (true);

-- Izinkan Service Role API untuk INSERT/UPDATE data
DROP POLICY IF EXISTS "Allow service role all laporan_harian" ON laporan_harian;
CREATE POLICY "Allow service role all laporan_harian"
  ON laporan_harian FOR ALL
  USING (true)
  WITH CHECK (true);

-- ==============================================================================
-- 4. Fungsi Otomatis: Rollup / Ekstraksi Data Harian dari sensor_readings
-- ==============================================================================
CREATE OR REPLACE FUNCTION rollup_laporan_harian_tanggal(target_date DATE)
RETURNS VOID AS $$
DECLARE
  start_day_iso TIMESTAMPTZ := (target_date || ' 00:00:00+07')::TIMESTAMPTZ;
  noon_iso      TIMESTAMPTZ := (target_date || ' 12:00:00+07')::TIMESTAMPTZ;
  target_pagi   TIMESTAMPTZ := (target_date || ' 08:00:00+07')::TIMESTAMPTZ;
  target_malam  TIMESTAMPTZ := (target_date || ' 20:00:00+07')::TIMESTAMPTZ;
  end_day_iso   TIMESTAMPTZ := (target_date || ' 23:59:59+07')::TIMESTAMPTZ;

  rec_pagi      RECORD;
  rec_malam     RECORD;
  rec_stats     RECORD;
  status_p      TEXT := '-';
  status_m      TEXT := '-';
  w_pagi        TEXT := '-';
  w_malam       TEXT := '-';
BEGIN
  -- Cari record pagi terdekat dengan 08:00 WIB
  SELECT suhu, humid, to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') as jam
  INTO rec_pagi
  FROM sensor_readings
  WHERE created_at >= start_day_iso AND created_at <= noon_iso
  ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - target_pagi))) ASC
  LIMIT 1;

  -- Cari record malam terdekat dengan 20:00 WIB
  SELECT suhu, humid, to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') as jam
  INTO rec_malam
  FROM sensor_readings
  WHERE created_at >= noon_iso AND created_at <= end_day_iso
  ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - target_malam))) ASC
  LIMIT 1;

  -- Hitung statistik harian 24 jam
  SELECT
    ROUND(AVG(suhu)::numeric, 1) as avg_s,
    ROUND(MIN(suhu)::numeric, 1) as min_s,
    ROUND(MAX(suhu)::numeric, 1) as max_s,
    ROUND(AVG(humid)::numeric, 1) as avg_h
  INTO rec_stats
  FROM sensor_readings
  WHERE created_at >= start_day_iso AND created_at <= end_day_iso;

  -- Tentukan status emoji jika data tersedia
  IF rec_pagi.suhu IS NOT NULL THEN
    w_pagi := rec_pagi.jam;
    IF rec_pagi.suhu > 27 THEN status_p := '🔴';
    ELSIF rec_pagi.suhu > 25 THEN status_p := '⚠️';
    ELSE status_p := '✅';
    END IF;
  END IF;

  IF rec_malam.suhu IS NOT NULL THEN
    w_malam := rec_malam.jam;
    IF rec_malam.suhu > 27 THEN status_m := '🔴';
    ELSIF rec_malam.suhu > 25 THEN status_m := '⚠️';
    ELSE status_m := '✅';
    END IF;
  END IF;

  -- Simpan / Update ke tabel laporan_harian jika ada data
  IF rec_pagi.suhu IS NOT NULL OR rec_malam.suhu IS NOT NULL OR rec_stats.avg_s IS NOT NULL THEN
    INSERT INTO laporan_harian (
      tanggal, waktu_pagi, suhu_pagi, humid_pagi, status_pagi,
      waktu_malam, suhu_malam, humid_malam, status_malam,
      avg_suhu, min_suhu, max_suhu, avg_humid, updated_at
    )
    VALUES (
      target_date, w_pagi, rec_pagi.suhu, rec_pagi.humid, status_p,
      w_malam, rec_malam.suhu, rec_malam.humid, status_m,
      rec_stats.avg_s, rec_stats.min_s, rec_stats.max_s, rec_stats.avg_h, NOW()
    )
    ON CONFLICT (tanggal) DO UPDATE SET
      waktu_pagi   = EXCLUDED.waktu_pagi,
      suhu_pagi    = EXCLUDED.suhu_pagi,
      humid_pagi   = EXCLUDED.humid_pagi,
      status_pagi  = EXCLUDED.status_pagi,
      waktu_malam  = EXCLUDED.waktu_malam,
      suhu_malam   = EXCLUDED.suhu_malam,
      humid_malam  = EXCLUDED.humid_malam,
      status_malam = EXCLUDED.status_malam,
      avg_suhu     = EXCLUDED.avg_suhu,
      min_suhu     = EXCLUDED.min_suhu,
      max_suhu     = EXCLUDED.max_suhu,
      avg_humid    = EXCLUDED.avg_humid,
      updated_at   = NOW();
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 5. Fungsi Pembersihan Otomatis (Retensi 90 Hari Data Mentah)
-- ==============================================================================
CREATE OR REPLACE FUNCTION purge_data_mentah_lama()
RETURNS INTEGER AS $$
DECLARE
  deleted_rows INTEGER;
BEGIN
  -- Hapus data mentah sensor_readings yang lebih tua dari 90 hari
  -- (Data laporan 08:00 & 20:00 sudah aman tersimpan permanen di tabel laporan_harian)
  DELETE FROM sensor_readings
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 6. Fungsi Rollup Semua Data yang Ada (Backfill Historis)
-- ==============================================================================
CREATE OR REPLACE FUNCTION backfill_semua_laporan()
RETURNS INTEGER AS $$
DECLARE
  cur_tgl DATE;
  total_processed INTEGER := 0;
BEGIN
  FOR cur_tgl IN
    SELECT DISTINCT (created_at AT TIME ZONE 'Asia/Jakarta')::DATE as tgl
    FROM sensor_readings
    ORDER BY tgl ASC
  LOOP
    PERFORM rollup_laporan_harian_tanggal(cur_tgl);
    total_processed := total_processed + 1;
  END LOOP;

  RETURN total_processed;
END;
$$ LANGUAGE plpgsql;

-- ── Jalankan Backfill Sekarang untuk Data yang Sudah Ada ─────────────────────
SELECT backfill_semua_laporan() AS hari_yang_berhasil_di_rollup;

-- ── Verifikasi Hasil ─────────────────────────────────────────────────────────
SELECT COUNT(*) AS total_laporan_tersimpan FROM laporan_harian;
SELECT * FROM laporan_harian ORDER BY tanggal DESC LIMIT 5;
