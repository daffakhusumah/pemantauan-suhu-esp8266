// pages/api/monthly.js
// GET /api/monthly?year=2026&month=9
// → laporan bulanan: data terdekat jam 08:00 (pagi) & 20:00 (malam) tiap hari

import { supabase } from '../../lib/supabase'

const WIB_OFFSET = 7 * 60 * 60 * 1000 // UTC+7 dalam ms

// Konversi UTC ke WIB
function toWIB(dateStr) {
  return new Date(new Date(dateStr).getTime() + WIB_OFFSET)
}

// Cari data terdekat dengan jam target (dalam menit dari tengah malam)
function findClosest(readings, targetMinutes, windowMinutes = 90) {
  let best = null
  let bestDiff = Infinity
  for (const r of readings) {
    const wib = toWIB(r.created_at)
    const mins = wib.getHours() * 60 + wib.getMinutes()
    const diff = Math.abs(mins - targetMinutes)
    if (diff <= windowMinutes && diff < bestDiff) {
      bestDiff = diff
      best = { ...r, wib }
    }
  }
  return best
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Parameter bulan & tahun (default: bulan ini)
  const now = new Date(new Date().getTime() + WIB_OFFSET)
  const year  = parseInt(req.query.year  || now.getFullYear())
  const month = parseInt(req.query.month || (now.getMonth() + 1))

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Parameter year/month tidak valid' })
  }

  // Rentang tanggal bulan tersebut (UTC)
  const startUTC = new Date(Date.UTC(year, month - 1, 1) - WIB_OFFSET)
  const endUTC   = new Date(Date.UTC(year, month, 1)     - WIB_OFFSET)

  const { data, error } = await supabase
    .from('sensor_readings')
    .select('suhu, humid, created_at')
    .gte('created_at', startUTC.toISOString())
    .lt('created_at',  endUTC.toISOString())
    .order('created_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  // Kelompokkan per hari WIB
  const byDay = {}
  for (const row of data || []) {
    const wib = toWIB(row.created_at)
    const key = `${wib.getUTCFullYear()}-${String(wib.getUTCMonth()+1).padStart(2,'0')}-${String(wib.getUTCDate()).padStart(2,'0')}`
    if (!byDay[key]) byDay[key] = []
    byDay[key].push(row)
  }

  // Format waktu HH:MM
  const fmtTime = (wib) => wib
    ? `${String(wib.getUTCHours()).padStart(2,'0')}:${String(wib.getUTCMinutes()).padStart(2,'0')}`
    : '-'

  // Jumlah hari dalam bulan
  const daysInMonth = new Date(year, month, 0).getDate()

  // Buat laporan per hari
  const PAGI_MENIT  = 8  * 60  // 08:00
  const MALAM_MENIT = 20 * 60  // 20:00

  const result = []
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const readings = byDay[key] || []

    const pagi  = findClosest(readings, PAGI_MENIT)
    const malam = findClosest(readings, MALAM_MENIT)

    // Status: ✅ normal, ⚠️ warning, 🔴 bahaya
    const getStatus = (suhu) => {
      if (!suhu) return '-'
      if (suhu > 27) return '🔴'
      if (suhu > 25) return '⚠️'
      return '✅'
    }

    result.push({
      tanggal:     key,
      hari:        day,
      // Pagi
      waktu_pagi:  pagi  ? fmtTime(pagi.wib)   : '-',
      suhu_pagi:   pagi  ? pagi.suhu            : null,
      humid_pagi:  pagi  ? pagi.humid           : null,
      status_pagi: getStatus(pagi?.suhu),
      // Malam
      waktu_malam: malam ? fmtTime(malam.wib)   : '-',
      suhu_malam:  malam ? malam.suhu            : null,
      humid_malam: malam ? malam.humid           : null,
      status_malam: getStatus(malam?.suhu),
      // Ada data atau tidak
      has_data: readings.length > 0,
    })
  }

  return res.status(200).json({
    year, month,
    nama_bulan: new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
    total_hari: daysInMonth,
    data: result,
  })
}
