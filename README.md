# 🌡️ Pemantauan Suhu Real-Time — Deploy ke Vercel

Dashboard pemantauan suhu dan kelembaban menggunakan **ESP8266 + DHT11**,
dikirim via **WiFi → Vercel API → Supabase**, tampil di browser kapan saja.

---

## 📁 Struktur Proyek

```
Pemantauan suhu/
├── firmware/
│   └── esp8266_dht11.ino      ← Upload ke ESP8266
└── nextjs-app/
    ├── lib/supabase.js         ← Koneksi Supabase
    ├── pages/
    │   ├── index.js            ← Dashboard web
    │   └── api/
    │       ├── data.js         ← POST (dari ESP8266) & GET (history)
    │       └── latest.js       ← GET data terbaru
    ├── supabase_schema.sql     ← SQL untuk setup database
    ├── package.json
    ├── next.config.js
    └── vercel.json
```

---

## 🚀 Panduan Deploy (Step-by-Step)

### Step 1 — Setup Supabase (Database)

1. Buka [supabase.com](https://supabase.com) → **New Project**
2. Catat **Project URL** dan **Service Role Key** (Settings → API)
3. Buka **SQL Editor** → **New Query** → paste isi `supabase_schema.sql` → **Run**

---

### Step 2 — Push ke GitHub

```bash
# Di folder nextjs-app
cd "d:\Project daffa\Pemantauan suhu\nextjs-app"
git init
git add .
git commit -m "Initial commit — pemantauan suhu"
```

Buka GitHub → **New Repository** → nama: `pemantauan-suhu` → buat → ikuti instruksi push.

---

### Step 3 — Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) → **Add New Project**
2. Import repo `pemantauan-suhu` dari GitHub
3. **Root Directory**: pilih `nextjs-app`
4. **Environment Variables** — tambahkan 3 variabel ini:

   | Name | Value |
   |------|-------|
   | `SUPABASE_URL` | URL dari Supabase (contoh: `https://xxxx.supabase.co`) |
   | `SUPABASE_SERVICE_KEY` | Service Role Key dari Supabase |
   | `API_SECRET` | Buat password bebas (contoh: `suhu-rahasia-123`) |

5. Klik **Deploy** → tunggu ~2 menit
6. Dapat URL: `https://pemantauan-suhu.vercel.app` ✅

---

### Step 4 — Update & Upload Firmware ESP8266

Buka `firmware/esp8266_dht11.ino`, ubah 4 baris ini:

```cpp
const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";
const char* SERVER_URL    = "https://pemantauan-suhu.vercel.app/api/data";
const char* API_KEY       = "suhu-rahasia-123";  // sama dengan API_SECRET di Vercel
```

**Install library tambahan** via Arduino Library Manager:
- `ArduinoJson` by Benoit Blanchon

Upload ke ESP8266 → buka Serial Monitor (9600 baud) → pastikan muncul:
```
[OK] WiFi terhubung! IP: 192.168.x.x
[OK] Data terkirim ke Vercel!
```

---

### Step 5 — Buka Dashboard

Buka browser → `https://pemantauan-suhu.vercel.app`

Dashboard akan menampilkan data real-time setiap 5 detik! 🎉

---

## 🔌 Wiring ESP8266 + DHT11

| ESP8266 (NodeMCU) | DHT11 |
|---|---|
| **D4** (GPIO2) | DATA |
| **3.3V** | VCC |
| **GND** | GND |

> Tambahkan resistor **10kΩ** antara VCC dan DATA pin DHT11

---

## 🐛 Troubleshooting

| Masalah | Solusi |
|---|---|
| LED berkedip 5x | HTTP gagal — cek API_SECRET dan URL Vercel |
| LED berkedip 10x cepat | Sensor DHT11 tidak terbaca — cek wiring |
| Dashboard `Belum ada data` | Tunggu ESP8266 kirim data pertama (10 detik) |
| Vercel error 401 | API_SECRET tidak cocok antara firmware dan Vercel |
| Vercel error 500 | Cek SUPABASE_URL dan SUPABASE_SERVICE_KEY |
