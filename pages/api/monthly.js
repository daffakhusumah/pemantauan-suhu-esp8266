// pages/api/monthly.js
// GET /api/monthly?year=2026&month=10
// Laporan bulanan: dirancang aman dan super cepat untuk 30 tahun ke depan.
// Memanfaatkan tabel permanen `laporan_harian` (1 query instan),
// dengan fallback otomatis dan self-healing ke `sensor_readings`.

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
  const minAllowedYear = currentYear - 10

  const year  = parseInt(req.query.year  || currentYear)
  const month = parseInt(req.query.month || currentMonth)

  // Validasi parameter dan batasan 10 tahun ke belakang
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Parameter year/month tidak valid' })
  }
  if (year < minAllowedYear) {
    return res.status(400).json({
      error: `Batas traceback data maksimal 10 tahun ke belakang (${minAllowedYear} - ${currentYear})`
    })
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const namaBulan = new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  const isFutureMonth = (year > currentYear) || (year === currentYear && month > currentMonth)
  const isPastMonth   = (year < currentYear) || (year === currentYear && month < currentMonth)
  const isCurrentMonth = (year === currentYear && month === currentMonth)
  const maxDayToQuery = isCurrentMonth ? Math.min(currentDay, daysInMonth) : daysInMonth

  // Helper template kosong
  const makeEmptyDays = () => {
    const list = []
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      list.push({
        tanggal: key, hari: day,
        waktu_pagi: '-', suhu_pagi: null, humid_pagi: null, status_pagi: '-',
        waktu_malam: '-', suhu_malam: null, humid_malam: null, status_malam: '-',
        has_data: false,
      })
    }
    return list
  }

  // 1. Jika bulan di masa depan, langsung return template kosong
  if (isFutureMonth) {
    return res.status(200).json({
      year, month, nama_bulan: namaBulan, total_hari: daysInMonth, data: makeEmptyDays()
    })
  }

  // 2. PRIORITAS UTAMA: Ambil dari tabel permanen `laporan_harian`
  // Hanya 1 query instan (~10ms) untuk mengambil seluruh bulan
  const startMonthDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonthDate   = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  let savedMap = {}
  let hasSavedTable = false

  try {
    const { data: savedRows, error: repErr } = await supabase
      .from('laporan_harian')
      .select('*')
      .gte('tanggal', startMonthDate)
      .lte('tanggal', endMonthDate)

    if (!repErr && savedRows) {
      hasSavedTable = true
      for (const r of savedRows) {
        const parts = r.tanggal.split('-')
        const dNum = parseInt(parts[2], 10)
        savedMap[dNum] = r
      }
    }
  } catch (_) {}

  // Cek apakah semua hari yang perlu dicari sudah ada di tabel laporan_harian
  let allDaysCovered = hasSavedTable && maxDayToQuery > 0
  for (let d = 1; d <= maxDayToQuery; d++) {
    if (!savedMap[d]) {
      allDaysCovered = false
      break
    }
  }

  // Jika semua hari sudah lengkap di tabel laporan_harian, langsung kembalikan!
  if (allDaysCovered) {
    const result = []
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const s = savedMap[day]
      if (s) {
        result.push({
          tanggal: key,
          hari: day,
          waktu_pagi:  s.waktu_pagi || '-',
          suhu_pagi:   s.suhu_pagi !== null ? parseFloat(s.suhu_pagi) : null,
          humid_pagi:  s.humid_pagi !== null ? parseFloat(s.humid_pagi) : null,
          status_pagi: s.status_pagi || '-',
          waktu_malam: s.waktu_malam || '-',
          suhu_malam:  s.suhu_malam !== null ? parseFloat(s.suhu_malam) : null,
          humid_malam: s.humid_malam !== null ? parseFloat(s.humid_malam) : null,
          status_malam: s.status_malam || '-',
          has_data: true,
        })
      } else {
        result.push({
          tanggal: key,
          hari: day,
          waktu_pagi: '-', suhu_pagi: null, humid_pagi: null, status_pagi: '-',
          waktu_malam: '-', suhu_malam: null, humid_malam: null, status_malam: '-',
          has_data: false,
        })
      }
    }

    if (isPastMonth) {
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200')
    }
    return res.status(200).json({
      year, month, nama_bulan: namaBulan, total_hari: daysInMonth, data: result
    })
  }

  // 3. JIKA BELUM ADA DI `laporan_harian`: Lakukan Pre-Check Ringan pada sensor_readings
  const startOfMonthIso = `${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`
  const nextMonthYear = month === 12 ? year + 1 : year
  const nextMonthNum  = month === 12 ? 1 : month + 1
  const startOfNextMonthIso = `${nextMonthYear}-${String(nextMonthNum).padStart(2, '0')}-01T00:00:00+07:00`

  try {
    const { count, error: countErr } = await supabase
      .from('sensor_readings')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonthIso)
      .lt('created_at', startOfNextMonthIso)

    // Jika di sensor_readings juga kosong sama sekali:
    if (!countErr && (count === 0 || count === null)) {
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200')
      return res.status(200).json({
        year, month, nama_bulan: namaBulan, total_hari: daysInMonth, data: makeEmptyDays()
      })
    }
  } catch (_) {}

  // 4. Query hanya hari-hari yang belum tersimpan (dalam batch terkendali)
  const daysToFetch = []
  for (let day = 1; day <= maxDayToQuery; day++) {
    if (!savedMap[day]) {
      daysToFetch.push(day)
    }
  }

  const fetchedResults = {}
  const BATCH_SIZE = 5

  for (let i = 0; i < daysToFetch.length; i += BATCH_SIZE) {
    const batchDays = daysToFetch.slice(i, i + BATCH_SIZE)
    const batchPromises = batchDays.map(async (day) => {
      const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const startOfDay  = `${dayStr}T00:00:00+07:00`
      const noon        = `${dayStr}T12:00:00+07:00`
      const targetPagi  = `${dayStr}T08:00:00+07:00`
      const targetMalam = `${dayStr}T20:00:00+07:00`
      const endOfDay    = `${dayStr}T23:59:59+07:00`

      const pagiPromise = getBest(
        supabase.from('sensor_readings').select('suhu, humid, created_at').gte('created_at', startOfDay).lte('created_at', targetPagi).order('created_at', { ascending: false }).limit(1),
        supabase.from('sensor_readings').select('suhu, humid, created_at').gte('created_at', targetPagi).lte('created_at', noon).order('created_at', { ascending: true }).limit(1),
        targetPagi
      )

      const malamPromise = getBest(
        supabase.from('sensor_readings').select('suhu, humid, created_at').gte('created_at', noon).lte('created_at', targetMalam).order('created_at', { ascending: false }).limit(1),
        supabase.from('sensor_readings').select('suhu, humid, created_at').gte('created_at', targetMalam).lte('created_at', endOfDay).order('created_at', { ascending: true }).limit(1),
        targetMalam
      )

      const [pagi, malam] = await Promise.all([pagiPromise, malamPromise])

      // Auto-sync / Simpan ke laporan_harian jika hari tersebut sudah lewat (kemarin atau sebelumnya)
      const isPastDay = isPastMonth || (isCurrentMonth && day < currentDay)
      if (hasSavedTable && isPastDay && (pagi || malam)) {
        try {
          await supabase.from('laporan_harian').upsert({
            tanggal:      dayStr,
            waktu_pagi:   pagi ? fmtTime(pagi.created_at) : '-',
            suhu_pagi:    pagi ? pagi.suhu : null,
            humid_pagi:   pagi ? pagi.humid : null,
            status_pagi:  pagi ? getStatus(pagi.suhu) : '-',
            waktu_malam:  malam ? fmtTime(malam.created_at) : '-',
            suhu_malam:   malam ? malam.suhu : null,
            humid_malam:  malam ? malam.humid : null,
            status_malam: malam ? getStatus(malam.suhu) : '-',
            updated_at:   new Date().toISOString(),
          }, { onConflict: 'tanggal' })
        } catch (_) {}
      }

      return { day, pagi, malam }
    })

    const batchRes = await Promise.all(batchPromises)
    for (const r of batchRes) {
      fetchedResults[r.day] = r
    }
  }

  // 5. Rakit hasil akhir 1 s/d daysInMonth
  const finalResult = []
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    if (savedMap[day]) {
      const s = savedMap[day]
      finalResult.push({
        tanggal: key,
        hari: day,
        waktu_pagi:  s.waktu_pagi || '-',
        suhu_pagi:   s.suhu_pagi !== null ? parseFloat(s.suhu_pagi) : null,
        humid_pagi:  s.humid_pagi !== null ? parseFloat(s.humid_pagi) : null,
        status_pagi: s.status_pagi || '-',
        waktu_malam: s.waktu_malam || '-',
        suhu_malam:  s.suhu_malam !== null ? parseFloat(s.suhu_malam) : null,
        humid_malam: s.humid_malam !== null ? parseFloat(s.humid_malam) : null,
        status_malam: s.status_malam || '-',
        has_data: true,
      })
    } else if (fetchedResults[day]) {
      const { pagi, malam } = fetchedResults[day]
      const hasData = Boolean(pagi || malam)
      finalResult.push({
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
    } else {
      finalResult.push({
        tanggal: key,
        hari: day,
        waktu_pagi: '-', suhu_pagi: null, humid_pagi: null, status_pagi: '-',
        waktu_malam: '-', suhu_malam: null, humid_malam: null, status_malam: '-',
        has_data: false,
      })
    }
  }

  if (isPastMonth) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=1800')
  }

  return res.status(200).json({
    year,
    month,
    nama_bulan: namaBulan,
    total_hari: daysInMonth,
    data: finalResult,
  })
}
