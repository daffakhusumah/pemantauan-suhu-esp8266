// pages/api/monthly.js
// GET /api/monthly?year=2026&month=9
// Laporan bulanan: pencarian efisien data Pagi (target 08:00 WIB) & Malam (target 20:00 WIB)

import { supabase } from '../../lib/supabase'

const WIB_OFFSET = 7 * 60 * 60 * 1000 // UTC+7 dalam ms

function toWIB(dateStr) {
  return new Date(new Date(dateStr).getTime() + WIB_OFFSET)
}

function fmtTime(dateStr) {
  if (!dateStr) return '-'
  const wib = toWIB(dateStr)
  return `${String(wib.getUTCHours()).padStart(2, '0')}:${String(wib.getUTCMinutes()).padStart(2, '0')}`
}

function getStatus(suhu) {
  if (suhu === null || suhu === undefined) return '-'
  if (suhu > 27) return '🔴'
  if (suhu > 25) return '⚠️'
  return '✅'
}

// Ambil record yang paling dekat dengan target waktu
async function getBest(queryBefore, queryAfter, targetIso) {
  const [resBefore, resAfter] = await Promise.all([queryBefore, queryAfter])
  const b = resBefore.data?.[0]
  const a = resAfter.data?.[0]
  if (!b && !a) return null
  if (!b) return a
  if (!a) return b
  const targetTime = new Date(targetIso).getTime()
  const diffB = Math.abs(new Date(b.created_at).getTime() - targetTime)
  const diffA = Math.abs(new Date(a.created_at).getTime() - targetTime)
  return diffB <= diffA ? b : a
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const nowWIB = new Date(new Date().getTime() + WIB_OFFSET)
  const currentYear = nowWIB.getUTCFullYear()
  const currentMonth = nowWIB.getUTCMonth() + 1
  const currentDay = nowWIB.getUTCDate()

  const year  = parseInt(req.query.year  || currentYear)
  const month = parseInt(req.query.month || currentMonth)

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Parameter year/month tidak valid' })
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const namaBulan = new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

  // Jika bulan di masa depan, langsung return array kosong
  const isFutureMonth = (year > currentYear) || (year === currentYear && month > currentMonth)
  if (isFutureMonth) {
    const emptyDays = []
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      emptyDays.push({
        tanggal: key, hari: day,
        waktu_pagi: '-', suhu_pagi: null, humid_pagi: null, status_pagi: '-',
        waktu_malam: '-', suhu_malam: null, humid_malam: null, status_malam: '-',
        has_data: false,
      })
    }
    return res.status(200).json({ year, month, nama_bulan: namaBulan, total_hari: daysInMonth, data: emptyDays })
  }

  // Tentukan batas hari yang perlu di-query (jika bulan berjalan, hanya sampai hari ini)
  const maxDayToQuery = (year === currentYear && month === currentMonth) ? Math.min(currentDay, daysInMonth) : daysInMonth

  // Query setiap hari secara efisien
  const dayPromises = []
  for (let day = 1; day <= maxDayToQuery; day++) {
    const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const startOfDay  = `${dayStr}T00:00:00+07:00`
    const noon        = `${dayStr}T12:00:00+07:00`
    const targetPagi  = `${dayStr}T08:00:00+07:00`
    const targetMalam = `${dayStr}T20:00:00+07:00`
    const endOfDay    = `${dayStr}T23:59:59+07:00`

    // Pagi: cari terdekat 08:00 WIB (antara 00:00 s.d 12:00 WIB)
    const pagiPromise = getBest(
      supabase.from('sensor_readings').select('suhu, humid, created_at').gte('created_at', startOfDay).lte('created_at', targetPagi).order('created_at', { ascending: false }).limit(1),
      supabase.from('sensor_readings').select('suhu, humid, created_at').gte('created_at', targetPagi).lte('created_at', noon).order('created_at', { ascending: true }).limit(1),
      targetPagi
    )

    // Malam: cari terdekat 20:00 WIB (antara 12:00 s.d 23:59 WIB)
    const malamPromise = getBest(
      supabase.from('sensor_readings').select('suhu, humid, created_at').gte('created_at', noon).lte('created_at', targetMalam).order('created_at', { ascending: false }).limit(1),
      supabase.from('sensor_readings').select('suhu, humid, created_at').gte('created_at', targetMalam).lte('created_at', endOfDay).order('created_at', { ascending: true }).limit(1),
      targetMalam
    )

    dayPromises.push(
      Promise.all([pagiPromise, malamPromise]).then(([pagi, malam]) => ({
        day,
        pagi,
        malam,
      }))
    )
  }

  const queryResults = await Promise.all(dayPromises)
  const resultMap = {}
  for (const r of queryResults) {
    resultMap[r.day] = r
  }

  const result = []
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const r = resultMap[day]
    const pagi = r?.pagi || null
    const malam = r?.malam || null
    const hasData = Boolean(pagi || malam)

    result.push({
      tanggal: key,
      hari: day,
      waktu_pagi:  pagi  ? fmtTime(pagi.created_at) : '-',
      suhu_pagi:   pagi  ? pagi.suhu : null,
      humid_pagi:  pagi  ? pagi.humid : null,
      status_pagi: pagi  ? getStatus(pagi.suhu) : '-',

      waktu_malam: malam ? fmtTime(malam.created_at) : '-',
      suhu_malam:  malam ? malam.suhu : null,
      humid_malam: malam ? malam.humid : null,
      status_malam: malam ? getStatus(malam.suhu) : '-',

      has_data: hasData,
    })
  }

  return res.status(200).json({
    year,
    month,
    nama_bulan: namaBulan,
    total_hari: daysInMonth,
    data: result,
  })
}
