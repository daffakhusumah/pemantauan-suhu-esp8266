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

  // ─── GET: Ambil 60 data terakhir ─────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('sensor_readings')
      .select('id, suhu, humid, device, created_at')
      .order('created_at', { ascending: false })
      .limit(60)

    if (error) {
      return res.status(500).json({ error: 'Gagal ambil data', detail: error.message })
    }

    // Balik urutan supaya grafik dari kiri ke kanan (lama → baru)
    const result = (data || []).reverse().map(row => ({
      id:        row.id,
      suhu:      row.suhu,
      humid:     row.humid,
      device:    row.device,
      timestamp: new Date(row.created_at).toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta'
      }),
    }))

    return res.status(200).json(result)
  }

  res.setHeader('Allow', ['GET', 'POST', 'OPTIONS'])
  return res.status(405).json({ error: `Method ${req.method} tidak diizinkan` })
}
