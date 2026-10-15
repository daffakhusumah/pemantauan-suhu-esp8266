-- ==============================================================================
-- SETUP TABEL STATE ALERT TELEGRAM (ANTI-SPAM & COOLDOWN)
-- RS FATMAWATI — SISTEM PEMANTAUAN SUHU RUANG SERVER
-- ==============================================================================
-- Jalankan query ini di:
-- Supabase Dashboard → SQL Editor → New Query → Klik RUN
-- ==============================================================================

CREATE TABLE IF NOT EXISTS telegram_alert_state (
  id               INT PRIMARY KEY DEFAULT 1,
  last_status      TEXT NOT NULL DEFAULT 'OK',       -- 'OK', 'WARNING', 'CRITICAL'
  last_alert_time  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_suhu        NUMERIC(4,1),
  last_humid       NUMERIC(4,1),
  active_ticket_id TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tambah kolom active_ticket_id jika tabel sudah terlanjur dibuat sebelumnya
ALTER TABLE telegram_alert_state ADD COLUMN IF NOT EXISTS active_ticket_id TEXT;

-- Inisialisasi baris tunggal (id = 1) jika belum ada
INSERT INTO telegram_alert_state (id, last_status, last_alert_time, last_suhu, last_humid)
VALUES (1, 'OK', NOW() - INTERVAL '1 hour', 22.0, 50.0)
ON CONFLICT (id) DO NOTHING;

-- Row Level Security (RLS)
ALTER TABLE telegram_alert_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role all telegram_alert_state" ON telegram_alert_state;
CREATE POLICY "Allow service role all telegram_alert_state"
  ON telegram_alert_state FOR ALL
  USING (true)
  WITH CHECK (true);
