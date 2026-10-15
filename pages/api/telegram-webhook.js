// pages/api/telegram-webhook.js
// Webhook receiver dari Telegram Bot API
// RS Fatmawati — Sistem Otomatisasi Tiket Troubleshoot Suhu Ruang Server

import { supabase } from '../../lib/supabase'
import { editMessageText } from '../../lib/telegram'

const WIB_OFFSET = 7 * 60 * 60 * 1000

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]
const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

export default async function handler(req, res) {
  // Hanya terima method POST dari Telegram
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Telegram Webhook Endpoint Ready' })
  }

  const update = req.body
  const token = process.env.TELEGRAM_BOT_TOKEN
  const channelChatId = process.env.TELEGRAM_CHAT_ID || '-1004456970752'
  const channelUsername = process.env.TELEGRAM_CHANNEL_USERNAME || 'PemantauanSuhuServerFatmawati'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://nextjs-app-ten-blue.vercel.app'

  try {
    const msg = update?.message

    // Validasi apakah pesan adalah balasan (comment/reply) pada grup diskusi
    if (msg && msg.reply_to_message) {
      const replyTo = msg.reply_to_message
      const isChannelOrigin = replyTo.forward_from_chat?.id?.toString() === channelChatId.toString()
      const originalText = replyTo.text || ''
      const isTicketPost = originalText.includes('[TIKET') || originalText.includes('No. Tiket:')

      // Jika pesan membalas sebuah postingan tiket insiden
      if (isChannelOrigin || isTicketPost) {
        const channelPostId = replyTo.forward_from_message_id

        // Ambil identitas teknisi
        const techName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') ||
          (msg.from?.username ? `@${msg.from.username}` : 'Teknisi RS Fatmawati')

        // Ambil keterangan atau caption
        const notes = (msg.caption || msg.text || '').trim() || 'Foto bukti fisik penanganan telah dilampirkan.'
        const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0

        const nowWIB = new Date(Date.now() + WIB_OFFSET)
        const jamWIB = `${String(nowWIB.getUTCHours()).padStart(2, '0')}:${String(nowWIB.getUTCMinutes()).padStart(2, '0')} WIB`
        const hariNama = HARI_ID[nowWIB.getUTCDay()]
        const tgl = nowWIB.getUTCDate()
        const bln = BULAN_ID[nowWIB.getUTCMonth()]
        const thn = nowWIB.getUTCFullYear()
        const waktuSelesai = `${hariNama}, ${tgl} ${bln} ${thn} — ${jamWIB}`

        // 1. Ekstrak nomor tiket jika ada di teks awal
        const matchTiket = originalText.match(/#TCK-[A-Za-z0-9\-]+/)
        const ticketNo = matchTiket ? matchTiket[0] : 'TIKET'

        // 2. Balas langsung di kolom komentar thread tersebut
        const confirmText = [
          `✅ <b>LAPORAN TROUBLESHOOTING DITERIMA</b>`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `👨‍🔧 <b>Teknisi:</b> ${techName}`,
          `🕐 <b>Waktu:</b> ${jamWIB}`,
          hasPhoto ? `📸 <b>Bukti Foto:</b> Terlampir` : `📝 <b>Catatan:</b> ${notes}`,
          notes && hasPhoto ? `📝 <b>Keterangan:</b> ${notes}` : ``,
          ``,
          `Tiket <code>${ticketNo}</code> otomatis dinyatakan <b>SELESAI (CLOSED)</b>. Status pada channel utama telah diperbarui.`,
          `<i>Terima kasih atas respon cepat dan tindakan perbaikannya!</i>`,
        ].filter(Boolean).join('\n')

        // Kirim konfirmasi balasan ke grup komentar
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: msg.chat.id,
              reply_to_message_id: msg.message_id,
              text: confirmText,
              parse_mode: 'HTML',
            }),
          })
        } catch (confirmErr) {
          console.warn('[Webhook] Gagal kirim balasan komentar:', confirmErr.message)
        }

        // 3. Update postingan tiket asli di channel utama menjadi SELESAI (CLOSED)
        if (channelPostId) {
          const updatedChannelText = [
            `🎫 <b>[TIKET INSIDEN SUHU RUANG SERVER]</b>`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `📌 <b>No. Tiket:</b> <code>${ticketNo}</code>`,
            `🟢 <b>Status:</b> <b>SELESAI (CLOSED)</b>`,
            `👨‍🔧 <b>Ditangani oleh:</b> ${techName}`,
            `🏥 <b>Lokasi:</b> Ruang Server RS Fatmawati`,
            `✅ <b>Waktu Selesai:</b> ${waktuSelesai}`,
            ``,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `📝 <b>CATATAN TROUBLESHOOTING:</b>`,
            `${notes}`,
            `📸 <i>Bukti foto dan detail tindakan telah diverifikasi di kolom komentar.</i>`,
            ``,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `✅ <i>Tiket ini telah ditutup (Resolved). Sistem pemantauan kembali aktif secara normal.</i>`,
          ].join('\n')

          await editMessageText({
            chatId: channelChatId,
            messageId: channelPostId,
            text: updatedChannelText,
            parseMode: 'HTML',
            replyMarkup: {
              inline_keyboard: [
                [
                  { text: '💬 Lihat Bukti Troubleshoot (Komentar)', url: `https://t.me/${channelUsername}/${channelPostId}?comment=1` },
                  { text: '📊 Dashboard Web', url: siteUrl }
                ]
              ]
            }
          })
        }

        // 4. Update status di database agar sistem tahu tiket sudah selesai
        try {
          await supabase
            .from('telegram_alert_state')
            .upsert({
              id: 1,
              last_status: 'OK',
              active_ticket_id: null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' })
        } catch (_) {}

        return res.status(200).json({ ok: true, message: 'Ticket marked as closed' })
      }
    }

    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('[Telegram Webhook Error]', error)
    return res.status(200).json({ ok: false, error: error.message })
  }
}
