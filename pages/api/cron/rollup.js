// pages/api/cron/rollup.js
// Endpoint otomatis / terjadwal untuk rollup data harian (pagi 08:00 & malam 20:00)
// dan pembersihan data mentah sensor_readings (>90 hari) agar database tetap ringan selamanya.

import { supabase } from '../../../lib/supabase'

const WIB_OFFSET = 7 * 60 * 60 * 1000

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

  // Validasi keamanan: izinkan dari Vercel Cron (header x-vercel-cron) atau API Key
  const isVercelCron = req.headers['x-vercel-cron'] === '1'
  const clientKey = req.headers['x-api-key'] || req.query.key || (req.headers['authorization'] || '').replace('Bearer ', '')
  const isAuthorized = isVercelCron || (process.env.API_SECRET && clientKey === process.env.API_SECRET)

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized: API key salah atau bukan panggilan cron resmi' })
  }

  const results = {
    rolled_up_days: 0,
    purged_records: 0,
    errors: [],
  }

  try {
    // 1. Dapatkan daftar tanggal unik dari sensor_readings yang ada dalam 90 hari terakhir
    const cutoffDate = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
    const { data: recentRows, error: fetchErr } = await supabase
      .from('sensor_readings')
      .select('created_at')
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: true })
      .limit(10000)

    if (fetchErr) {
      throw fetchErr
    }

    // Ambil tanggal unik (format YYYY-MM-DD WIB)
    const uniqueDates = new Set()
    for (const r of (recentRows || [])) {
      const wib = toWIB(r.created_at)
      const dateKey = `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, '0')}-${String(wib.getUTCDate()).padStart(2, '0')}`
      uniqueDates.add(dateKey)
    }

    // 2. Rollup setiap tanggal ke tabel laporan_harian
    for (const dayStr of Array.from(uniqueDates)) {
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

      if (pagi || malam) {
        // Hitung min/max/avg dari sample hari tersebut
        const { data: statsRows } = await supabase
          .from('sensor_readings')
          .select('suhu, humid')
          .gte('created_at', startOfDay)
          .lte('created_at', endOfDay)
          .limit(1000)

        const suhus = (statsRows || []).map(r => r.suhu).filter(s => s !== null && s !== undefined)
        const humids = (statsRows || []).map(r => r.humid).filter(h => h !== null && h !== undefined)

        const avgS = suhus.length ? parseFloat((suhus.reduce((a, b) => a + b, 0) / suhus.length).toFixed(1)) : null
        const minS = suhus.length ? Math.min(...suhus) : null
        const maxS = suhus.length ? Math.max(...suhus) : null
        const avgH = humids.length ? parseFloat((humids.reduce((a, b) => a + b, 0) / humids.length).toFixed(1)) : null

        const { error: upsertErr } = await supabase
          .from('laporan_harian')
          .upsert({
            tanggal:      dayStr,
            waktu_pagi:   pagi ? fmtTime(pagi.created_at) : '-',
            suhu_pagi:    pagi ? pagi.suhu : null,
            humid_pagi:   pagi ? pagi.humid : null,
            status_pagi:  pagi ? getStatus(pagi.suhu) : '-',
            waktu_malam:  malam ? fmtTime(malam.created_at) : '-',
            suhu_malam:   malam ? malam.suhu : null,
            humid_malam:  malam ? malam.humid : null,
            status_malam: malam ? getStatus(malam.suhu) : '-',
            avg_suhu:     avgS,
            min_suhu:     minS,
            max_suhu:     maxS,
            avg_humid:    avgH,
            updated_at:   new Date().toISOString(),
          }, { onConflict: 'tanggal' })

        if (!upsertErr) {
          results.rolled_up_days++
        } else {
          results.errors.push(`Gagal upsert tanggal ${dayStr}: ${upsertErr.message}`)
        }
      }
    }

    // 3. Purge: Hapus data mentah sensor_readings yang lebih tua dari 90 hari
    // Data laporan 08:00 & 20:00 sudah aman di tabel laporan_harian
    const purgeCutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
    const { count: purgeCount, error: purgeErr } = await supabase
      .from('sensor_readings')
      .delete({ count: 'exact' })
      .lt('created_at', purgeCutoff)

    if (!purgeErr) {
      results.purged_records = purgeCount || 0
    } else {
      results.errors.push(`Purge error: ${purgeErr.message}`)
    }

    return res.status(200).json({
      success: true,
      message: 'Proses rollup dan pembersihan data 90 hari selesai.',
      data: results,
    })
  } catch (err) {
    console.error('[Rollup Cron Error]', err)
    return res.status(500).json({
      success: false,
      error: err.message,
      data: results,
    })
  }
}
