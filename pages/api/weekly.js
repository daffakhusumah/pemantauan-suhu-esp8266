// pages/api/weekly.js
// GET /api/weekly → rata-rata suhu & humid per hari selama 7 hari terakhir

import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const WIB_OFFSET = 7 * 60 * 60 * 1000

  // Siapkan daftar 7 hari terakhir
  const dayQueries = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = new Date(d.getTime() + WIB_OFFSET).toISOString().slice(0, 10)
    const startIso = `${dateStr}T00:00:00+07:00`
    const endIso   = `${dateStr}T23:59:59+07:00`
    const label    = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })

    dayQueries.push(
      supabase
        .from('sensor_readings')
        .select('suhu, humid')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .then(({ data }) => {
          const rows = data || []
          const avg = arr => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null
          return {
            tanggal: dateStr,
            label,
            avg_suhu:  avg(rows.map(r => r.suhu)),
            avg_humid: avg(rows.map(r => r.humid)),
            count:     rows.length,
          }
        })
    )
  }

  const result = await Promise.all(dayQueries)
  return res.status(200).json(result)
}
