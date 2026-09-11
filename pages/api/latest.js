// pages/api/latest.js
// GET /api/latest → ambil 1 data terbaru saja (untuk update kartu di dashboard)

import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { data, error } = await supabase
    .from('sensor_readings')
    .select('suhu, humid, device, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    // Jika belum ada data sama sekali
    if (error.code === 'PGRST116') {
      return res.status(200).json({ suhu: null, humid: null, timestamp: null, status: 'Belum ada data' })
    }
    return res.status(500).json({ error: 'Gagal ambil data terbaru', detail: error.message })
  }

  const wib = new Date(data.created_at).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta'
  })

  // Hitung selisih waktu (jika > 30 detik, sensor mungkin mati)
  const diffSeconds = Math.floor((Date.now() - new Date(data.created_at).getTime()) / 1000)
  const status = diffSeconds > 60
    ? `⚠️ Tidak ada data baru (${diffSeconds}s yang lalu)`
    : '✅ Online'

  return res.status(200).json({
    suhu:      data.suhu,
    humid:     data.humid,
    device:    data.device,
    timestamp: wib,
    status,
    diffSeconds,
  })
}
