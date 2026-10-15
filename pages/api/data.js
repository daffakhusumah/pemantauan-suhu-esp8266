// pages/api/data.js
//
// POST /api/data  → terima data dari ESP8266 + SHT31, simpan ke Supabase
// GET  /api/data  → ambil 60 data terakhir untuk grafik

import { supabase } from '../../lib/supabase'
import { sendTelegramMessage, editMessageReplyMarkup } from '../../lib/telegram'

const COOLDOWN_MINUTES = 30 // Jeda notifikasi pengingat jika kondisi bahaya berlanjut
const WIB_OFFSET = 7 * 60 * 60 * 1000

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]
const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

// In-memory fallback state jika tabel telegram_alert_state di Supabase belum dibuat
let memoryAlertState = {
  last_status: 'OK',
  last_alert_time: 0,
  active_ticket_id: null,
}

function evaluateStatus(s, h) {
  const isCrit = s > 28.0 || h > 65.0 || s < 15.0 || h < 35.0
  if (isCrit) return 'CRITICAL'
  const isWarn = s > 25.0 || h > 55.0 || s < 18.0 || h < 40.0
  if (isWarn) return 'WARNING'
  return 'OK'
}

async function handleTelegramAlert(suhu, humid) {
  // Hanya proses jika kredensial Telegram tersedia
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return

  const currentStatus = evaluateStatus(suhu, humid)

  try {
    // 1. Coba baca state terakhir dari database telegram_alert_state
    let state = memoryAlertState
    try {
      const { data: dbState, error: stateErr } = await supabase
        .from('telegram_alert_state')
        .select('*')
        .eq('id', 1)
        .maybeSingle()

      if (!stateErr && dbState) {
        state = dbState
      }
    } catch (_) {}

    const lastStatus = state.last_status || 'OK'
    const lastTime = state.last_alert_time ? new Date(state.last_alert_time).getTime() : 0
    const now = Date.now()
    const diffMinutes = (now - lastTime) / (60 * 1000)

    let shouldSend = false
    let isRecovery = false

    if (currentStatus === 'CRITICAL' || currentStatus === 'WARNING') {
      // Kondisi 1: Status berubah naik (misal dari OK -> WARNING/CRITICAL, atau WARNING -> CRITICAL)
      if (lastStatus !== currentStatus) {
        shouldSend = true
      }
      // Kondisi 2: Status masih sama (misal terus-menerus Bahaya), tapi sudah lewat batas cooldown 30 menit
      else if (diffMinutes >= COOLDOWN_MINUTES) {
        shouldSend = true
      }
    } else if (currentStatus === 'OK') {
      // Kondisi 3: Recovery (Sebelumnya Bahaya/Waspada, sekarang sudah kembali Normal)
      if (lastStatus === 'CRITICAL' || lastStatus === 'WARNING') {
        shouldSend = true
        isRecovery = true
      }
    }

    if (!shouldSend) return

    const nowWIB = new Date(Date.now() + WIB_OFFSET)
    const jamWIB = `${String(nowWIB.getUTCHours()).padStart(2, '0')}:${String(nowWIB.getUTCMinutes()).padStart(2, '0')} WIB`
    const hariNama = HARI_ID[nowWIB.getUTCDay()]
    const tgl = nowWIB.getUTCDate()
    const bln = BULAN_ID[nowWIB.getUTCMonth()]
    const thn = nowWIB.getUTCFullYear()
    const waktuFormat = `${hariNama}, ${tgl} ${bln} ${thn} — ${jamWIB}`

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://nextjs-app-ten-blue.vercel.app'
    const channelUsername = process.env.TELEGRAM_CHANNEL_USERNAME || 'PemantauanSuhuServerFatmawati'

    let message = ''
    let currentTicketId = state.active_ticket_id

    if (isRecovery) {
      const closedTicket = currentTicketId || `#TCK-${thn}${String(nowWIB.getUTCMonth() + 1).padStart(2, '0')}${String(tgl).padStart(2, '0')}-${String(nowWIB.getUTCHours()).padStart(2, '0')}${String(nowWIB.getUTCMinutes()).padStart(2, '0')}`

      message = [
        `🎫 <b>[TIKET INSIDEN SUHU SELESAI / CLOSED]</b>`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📌 <b>Ref. Tiket:</b> <code>${closedTicket}</code>`,
        `🟢 <b>Status Tiket:</b> <b>RESOLVED (SUHU KEMBALI NORMAL)</b>`,
        `🏥 <b>Lokasi:</b> Ruang Server RS Fatmawati`,
        `🕐 <b>Waktu Pemulihan:</b> ${waktuFormat}`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📊 <b>KONDISI RUANGAN SAAT INI:</b>`,
        `🌡️ <b>Suhu:</b> <code>${suhu.toFixed(1)}°C</code> (Normal: 18.0–25.0°C)`,
        `💧 <b>Kelembapan:</b> <code>${humid.toFixed(1)}% RH</code> (Normal: 40–55% RH)`,
        `📊 <b>Status Sistem:</b> 🟢 NORMAL (AMAN)`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `✅ <i>Sistem pendingin dan sirkulasi udara telah kembali normal dan stabil. Terima kasih kepada tim teknisi atas respon cepat dan dokumentasi penanganan pada tiket ini.</i>`,
      ].join('\n')
    } else {
      const isCrit = currentStatus === 'CRITICAL'
      const statusTitle = isCrit ? 'BAHAYA (CRITICAL)' : 'WASPADA (WARNING)'
      const ticketId = state.active_ticket_id || `#TCK-${thn}${String(nowWIB.getUTCMonth() + 1).padStart(2, '0')}${String(tgl).padStart(2, '0')}-${String(nowWIB.getUTCHours()).padStart(2, '0')}${String(nowWIB.getUTCMinutes()).padStart(2, '0')}`
      currentTicketId = ticketId

      const detailList = []
      if (suhu > 28.0) detailList.push(`• Suhu <b>${suhu.toFixed(1)}°C</b> melebihi batas bahaya (&gt;28.0°C)`)
      else if (suhu > 25.0) detailList.push(`• Suhu <b>${suhu.toFixed(1)}°C</b> mendekati batas atas (25.1–28.0°C)`)
      else if (suhu < 15.0) detailList.push(`• Suhu <b>${suhu.toFixed(1)}°C</b> terlalu dingin (&lt;15.0°C)`)
      else if (suhu < 18.0) detailList.push(`• Suhu <b>${suhu.toFixed(1)}°C</b> di bawah batas normal (&lt;18.0°C)`)

      if (humid > 65.0) detailList.push(`• Kelembapan <b>${humid.toFixed(1)}% RH</b> melebihi batas bahaya (&gt;65% RH)`)
      else if (humid > 55.0) detailList.push(`• Kelembapan <b>${humid.toFixed(1)}% RH</b> mendekati batas atas (56–65% RH)`)
      else if (humid < 35.0) detailList.push(`• Kelembapan <b>${humid.toFixed(1)}% RH</b> terlalu kering (&lt;35% RH)`)
      else if (humid < 40.0) detailList.push(`• Kelembapan <b>${humid.toFixed(1)}% RH</b> mendekati batas bawah (&lt;40% RH)`)

      message = [
        `🎫 <b>[TIKET GANGGUAN SUHU RUANG SERVER]</b>`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📌 <b>No. Tiket:</b> <code>${ticketId}</code>`,
        `🔴 <b>Status:</b> <b>OPEN (PERLU TINDAKAN TEKNISI)</b>`,
        `⚠️ <b>Tingkat Keparahan:</b> ${isCrit ? '🔴 ' : '🟡 '}${statusTitle}`,
        `🏥 <b>Lokasi:</b> Ruang Server RS Fatmawati`,
        `🕐 <b>Waktu Peringatan:</b> ${waktuFormat}`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📊 <b>DETAIL ANOMALI PARAMETER:</b>`,
        `🌡️ <b>Suhu:</b> <code>${suhu.toFixed(1)}°C</code> (Normal: 18.0–25.0°C)`,
        `💧 <b>Kelembapan:</b> <code>${humid.toFixed(1)}% RH</code> (Normal: 40–55% RH)`,
        detailList.join('\n'),
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🛠️ <b>INSTRUKSI TEKNISI:</b>`,
        `Cukup balas (comment) di bawah tiket ini dengan melampirkan:`,
        `📸 <b>Foto fisik</b> kondisi AC / display suhu ruangan`,
        `📝 <b>Keterangan singkat</b> tindakan penanganan yang dilakukan`,
        ``,
        `✅ <i>Tiket otomatis dinyatakan <b>SELESAI (CLOSED)</b> setelah komentar balasan dan foto dikirimkan.</i>`,
      ].join('\n')
    }

    // Kirim pesan Telegram ke Channel
    const tgRes = await sendTelegramMessage({
      text: message,
      parseMode: 'HTML',
      disableWebPagePreview: true,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📊 Dashboard Web', url: siteUrl }]
        ]
      }
    })

    // Jika pesan tiket peringatan berhasil terkirim dan ada messageId, update tombol interaktif
    if (!isRecovery && tgRes?.success && tgRes?.messageId) {
      const commentUrl = `https://t.me/${channelUsername}/${tgRes.messageId}?comment=1`
      await editMessageReplyMarkup({
        messageId: tgRes.messageId,
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '💬 Balas Troubleshoot (Komentar)', url: commentUrl },
              { text: '📊 Dashboard Web', url: siteUrl }
            ]
          ]
        }
      })
    }

    // Update state di database Supabase atau in-memory
    const updatedState = {
      id: 1,
      last_status: currentStatus,
      last_alert_time: new Date().toISOString(),
      last_suhu: parseFloat(suhu.toFixed(1)),
      last_humid: parseFloat(humid.toFixed(1)),
      active_ticket_id: isRecovery ? null : currentTicketId,
      updated_at: new Date().toISOString(),
    }

    memoryAlertState = updatedState

    try {
      await supabase
        .from('telegram_alert_state')
        .upsert(updatedState, { onConflict: 'id' })
    } catch (_) {}

  } catch (err) {
    console.warn('[Telegram Alert Warning]', err.message)
  }
}

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
        device: device || 'ESP8266-SHT31',
      })

    if (error) {
      console.error('[Supabase error]', error)
      return res.status(500).json({ error: 'Gagal simpan ke database', detail: error.message })
    }

    // Trigger pengecekan alert Telegram (Asynchronous & Anti-Spam)
    handleTelegramAlert(suhu, humid).catch(err => {
      console.warn('[Telegram Alert Async Warning]', err.message)
    })

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
