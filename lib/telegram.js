// lib/telegram.js
// Utility untuk mengirim pesan notifikasi ke Telegram Bot API
// RS Fatmawati — Sistem Pemantauan Suhu Ruang Server

export async function sendTelegramMessage({
  text,
  chatId = process.env.TELEGRAM_CHAT_ID,
  parseMode = 'HTML',
  disableWebPagePreview = true,
  replyMarkup = null,
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID

  if (!token || !targetChatId) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diset di environment variables')
    return { success: false, error: 'Telegram credentials not configured' }
  }

  try {
    const payload = {
      chat_id: targetChatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: disableWebPagePreview,
    }

    if (replyMarkup) {
      payload.reply_markup = replyMarkup
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok || !data.ok) {
      console.error('[Telegram API Error]', data)
      return { success: false, error: data.description || 'Gagal mengirim pesan Telegram', detail: data }
    }

    return { success: true, messageId: data.result?.message_id, data }
  } catch (err) {
    console.error('[Telegram Network Error]', err)
    return { success: false, error: err.message }
  }
}

export async function editMessageReplyMarkup({
  chatId = process.env.TELEGRAM_CHAT_ID,
  messageId,
  replyMarkup,
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID

  if (!token || !targetChatId || !messageId) {
    return { success: false, error: 'Missing token, chatId, or messageId' }
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      }),
    })

    const data = await response.json()
    if (!response.ok || !data.ok) {
      console.warn('[Telegram Edit Markup Warning]', data)
      return { success: false, error: data.description, detail: data }
    }

    return { success: true, data }
  } catch (err) {
    console.warn('[Telegram Edit Markup Error]', err.message)
    return { success: false, error: err.message }
  }
}
