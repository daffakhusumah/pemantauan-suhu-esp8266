// pages/api/data.js
//
// POST /api/data  → terima data dari ESP8266, simpan ke Supabase
// GET  /api/data  → ambil 60 data terakhir untuk grafik

import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  // ─── CORS (izinkan ESP8266 dan browser) ─────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // ─── POST: Terima data dari ESP8266 ─────────────────────────────────────
  if (req.method === 'POST') {
    // Validasi API Key (keamanan sederhana)
    const apiKey = req.headers['x-api-key']
    if (apiKey !== process.env.API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized: API key salah' })
    }

    const { suhu, humid, device } = req.body

    // Validasi data
    if (suhu === undefined || humid === undefined) {
      return res.status(400).json({ error: 'Field suhu dan humid wajib diisi' })
    }
    if (typeof suhu !== 'number' || typeof humid !== 'number') {
      return res.status(400).json({ error: 'suhu dan humid harus berupa angka' })
    }
    if (suhu < -40 || suhu > 80) {
      return res.status(400).json({ error: 'Nilai suhu tidak valid (range: -40 s/d 80°C)' })
    }
    if (humid < 0 || humid > 100) {
      return res.status(400).json({ error: 'Nilai humid tidak valid (range: 0-100%)' })
    }

    // Simpan ke Supabase
    const { error } = await supabase
      .from('sensor_readings')
      .insert({
        suhu:   parseFloat(suhu.toFixed(1)),
        humid:  parseFloat(humid.toFixed(1)),
        device: device || 'ESP8266-DHT11',
      })

    if (error) {
      console.error('[Supabase error]', error)
      return res.status(500).json({ error: 'Gagal simpan ke database', detail: error.message })
    }

    return res.status(201).json({ success: true, message: 'Data tersimpan' })
  }

  // ─── GET: Ambil data grafik ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const range = req.query.range || '24h'

    // Mode Real-Time: 60 data terakhir (per 10 detik)
    if (range === 'realtime') {
      const { data, error } = await supabase
        .from('sensor_readings')
        .select('id, suhu, humid, device, created_at')
        .order('created_at', { ascending: false })
        .limit(60)

      if (error) {
        return res.status(500).json({ error: 'Gagal ambil data', detail: error.message })
      }

      const result = (data || []).reverse().map(row => ({
        id:        row.id,
        suhu:      row.suhu,
        humid:     row.humid,
        device:    row.device,
        timestamp: new Date(row.created_at).toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta'
        }),
        full_time: new Date(row.created_at).toLocaleString('id-ID', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta'
        }),
        has_data:  true,
      }))

      return res.status(200).json(result)
    }

    // Default: range === '24h' (Format 24 Jam Terakhir)
    // Query 24 jam dengan 24 query paralel per jam agar data akurat & bebas limit 1000 row
    try {
      const now = new Date()
      const currentMs = now.getTime()

      const hourPromises = []
      for (let h = 23; h >= 0; h--) {
        const slotStart = new Date(currentMs - (h + 1) * 3600000)
        const slotEnd   = new Date(currentMs - h * 3600000)

        hourPromises.push(
          supabase
            .from('sensor_readings')
            .select('suhu, humid, created_at')
            .gte('created_at', slotStart.toISOString())
            .lt('created_at', slotEnd.toISOString())
            .order('created_at', { ascending: true })
            .then(({ data, error }) => ({
              slotStart,
              slotEnd,
              rows: error ? [] : (data || []),
            }))
        )
      }

      const hourResults = await Promise.all(hourPromises)

      // Bentuk titik-titik data (interval 15 menit = 96 titik dalam 24 jam)
      const points = []

      for (const hr of hourResults) {
        const baseTime = hr.slotStart.getTime()
        for (let s = 0; s < 4; s++) {
          const subStart = new Date(baseTime + s * 15 * 60 * 1000)
          const subEnd   = new Date(baseTime + (s + 1) * 15 * 60 * 1000)

          if (subStart > now) continue

          const inSlot = hr.rows.filter(r => {
            const t = new Date(r.created_at).getTime()
            return t >= subStart.getTime() && t < subEnd.getTime()
          })

          const timeLabel = subStart.toLocaleTimeString('id-ID', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
          })
          const fullTime = subStart.toLocaleString('id-ID', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
          })

          if (inSlot.length > 0) {
            const suhus  = inSlot.map(r => r.suhu)
            const humids = inSlot.map(r => r.humid)
            const avgSuhu  = parseFloat((suhus.reduce((a, b) => a + b, 0) / suhus.length).toFixed(1))
            const avgHumid = parseFloat((humids.reduce((a, b) => a + b, 0) / humids.length).toFixed(1))
            const minSuhu  = Math.min(...suhus)
            const maxSuhu  = Math.max(...suhus)

            points.push({
              timestamp: timeLabel,
              full_time: `${fullTime} WIB`,
              suhu:      avgSuhu,
              min_suhu:  minSuhu,
              max_suhu:  maxSuhu,
              humid:     avgHumid,
              count:     inSlot.length,
              has_data:  true,
            })
          } else {
            points.push({
              timestamp: timeLabel,
              full_time: `${fullTime} WIB`,
              suhu:      null,
              humid:     null,
              count:     0,
              has_data:  false,
            })
          }
        }
      }

      return res.status(200).json(points)
    } catch (err) {
      console.error('[24h query error]', err)
      return res.status(500).json({ error: 'Gagal memproses data 24 jam', detail: err.message })
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'OPTIONS'])
  return res.status(405).json({ error: `Method ${req.method} tidak diizinkan` })
}
