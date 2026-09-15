// pages/api/weekly.js
// GET /api/weekly → rata-rata suhu & humid per hari selama 7 hari terakhir

import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Ambil data 7 hari terakhir
  const since = new Date()
  since.setDate(since.getDate() - 6)
  since.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('sensor_readings')
    .select('suhu, humid, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  // Kelompokkan per hari (WIB = UTC+7)
  const byDay = {}
  for (const row of data || []) {
    const wib = new Date(new Date(row.created_at).getTime() + 7 * 3600 * 1000)
    const key = wib.toISOString().slice(0, 10) // YYYY-MM-DD
    if (!byDay[key]) byDay[key] = { suhuList: [], humidList: [] }
    byDay[key].suhuList.push(row.suhu)
    byDay[key].humidList.push(row.humid)
  }

  // Hitung rata-rata per hari
  const avg = (arr) => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null

  // Pastikan 7 hari selalu ada (isi null jika tidak ada data)
  const result = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
    const dayData = byDay[key]
    const label = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
    result.push({
      tanggal: key,
      label,
      avg_suhu:  dayData ? avg(dayData.suhuList)  : null,
      avg_humid: dayData ? avg(dayData.humidList) : null,
      count: dayData ? dayData.suhuList.length : 0,
    })
  }

  return res.status(200).json(result)
}
