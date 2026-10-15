// pages/api/cron/telegram-report.js
// Endpoint otomatis untuk mengirim laporan rutin suhu & kelembaban ke Telegram Channel
// Terjadwal pada: 08:00 WIB (Pagi) dan 20:00 WIB (Malam)
// RS Fatmawati — Sistem Pemantauan Suhu Ruang Server

import { supabase } from '../../../lib/supabase'
import { sendTelegramMessage } from '../../../lib/telegram'

const WIB_OFFSET = 7 * 60 * 60 * 1000

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function getStatusInfo(suhu, humid) {
  const s = parseFloat(suhu)
  const h = parseFloat(humid)

  const sCrit = !isNaN(s) && (s > 28 || s < 15)
  const hCrit = !isNaN(h) && (h > 65 || h < 35)
  if (sCrit || hCrit) return { label: '🔴 BAHAYA (CRITICAL)', level: 'CRITICAL', color: '#ef4444' }

  const sWarn = !isNaN(s) && (s > 25 || s < 18)
  const hWarn = !isNaN(h) && (h > 55 || h < 40)
  if (sWarn || hWarn) return { label: '🟡 WASPADA (WARNING)', level: 'WARNING', color: '#f59e0b' }

  return { label: '🟢 NORMAL (AMAN)', level: 'OK', color: '#22c55e' }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  // Validasi keamanan: Vercel Cron atau API Secret
  const isVercelCron = req.headers['x-vercel-cron'] === '1'
  const clientKey = req.headers['x-api-key'] || req.query.key || (req.headers['authorization'] || '').replace('Bearer ', '')
  const isAuthorized = isVercelCron || (process.env.API_SECRET && clientKey === process.env.API_SECRET)

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized: API key salah atau bukan panggilan cron resmi' })
  }

  try {
    const nowWIB = new Date(Date.now() + WIB_OFFSET)
    const jamWIB = nowWIB.getUTCHours()
    const menitWIB = String(nowWIB.getUTCMinutes()).padStart(2, '0')
    const hariNama = HARI_ID[nowWIB.getUTCDay()]
    const tgl = nowWIB.getUTCDate()
    const bln = BULAN_ID[nowWIB.getUTCMonth()]
    const thn = nowWIB.getUTCFullYear()

    const waktuParam = req.query.time || (jamWIB < 14 ? 'morning' : 'night')
    const isPagi = waktuParam === 'morning'
    const sesiJudul = isPagi ? '🌅 LAPORAN PAGI (08:00 WIB)' : '🌙 LAPORAN MALAM (20:00 WIB)'

    // 1. Ambil data sensor pembacaan terbaru
    const { data: latestRows, error: fetchErr } = await supabase
      .from('sensor_readings')
      .select('suhu, humid, created_at')
      .order('created_at', { ascending: false })
      .limit(1)

    if (fetchErr) {
      console.error('[Telegram Report] Gagal ambil sensor_readings:', fetchErr)
      return res.status(500).json({ error: 'Gagal mengambil data sensor', detail: fetchErr.message })
    }

    const latest = latestRows?.[0]
    const suhuStr = latest?.suhu !== null && latest?.suhu !== undefined ? `${Number(latest.suhu).toFixed(1)}°C` : '--'
    const humidStr = latest?.humid !== null && latest?.humid !== undefined ? `${Number(latest.humid).toFixed(1)}% RH` : '--'
    const statusObj = getStatusInfo(latest?.suhu, latest?.humid)

    const wibSensorTime = latest?.created_at ? new Date(new Date(latest.created_at).getTime() + WIB_OFFSET) : nowWIB
    const jamSensorStr = `${String(wibSensorTime.getUTCHours()).padStart(2, '0')}:${String(wibSensorTime.getUTCMinutes()).padStart(2, '0')} WIB`

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://nextjs-app-ten-blue.vercel.app'

    // 2. Susun format pesan HTML
    const message = [
      `<b>${sesiJudul}</b>`,
      `<b>RS Fatmawati — Pemantauan Ruang Server</b>`,
      ``,
      `📅 <b>Tanggal:</b> ${hariNama}, ${tgl} ${bln} ${thn}`,
      `🕐 <b>Waktu Data:</b> ${jamSensorStr}`,
      ``,
      `🌡️ <b>Suhu:</b> <code>${suhuStr}</code> (Normal: 18.0–25.0°C)`,
      `💧 <b>Kelembapan:</b> <code>${humidStr}</code> (Normal: 40–55% RH)`,
      `📊 <b>Status Ruangan:</b> ${statusObj.label}`,
      ``,
      `🌐 <a href="${siteUrl}">Buka Dashboard Pemantauan</a>`,
    ].join('\n')

    // 3. Kirim ke Telegram Channel
    const tgRes = await sendTelegramMessage({
      text: message,
      parseMode: 'HTML',
      disableWebPagePreview: true,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📊 Buka Dashboard Web', url: siteUrl }]
        ]
      }
    })

    // 4. Jika laporan malam, jalankan juga auto-rollup harian
    if (!isPagi) {
      try {
        const todayStr = `${thn}-${String(nowWIB.getUTCMonth() + 1).padStart(2, '0')}-${String(tgl).padStart(2, '0')}`
        await supabase.rpc('rollup_laporan_harian_tanggal', { target_date: todayStr })
      } catch (err) {
        console.warn('[Telegram Report] Auto-rollup nightly warning:', err.message)
      }
    }

    return res.status(200).json({
      success: true,
      session: waktuParam,
      telegram: tgRes,
      latest_data: { suhu: latest?.suhu, humid: latest?.humid, status: statusObj.level }
    })
  } catch (error) {
    console.error('[Telegram Report Handler Error]', error)
    return res.status(500).json({ error: 'Internal Server Error', message: error.message })
  }
}
