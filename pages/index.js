// pages/index.js
// Dashboard Pemantauan Suhu — Next.js + Chart.js + polling setiap 5 detik

import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'

const MAX_POINTS = 30

export default function Dashboard() {
  const chartSuhuRef  = useRef(null)
  const chartHumidRef = useRef(null)
  const chartSuhuObj  = useRef(null)
  const chartHumidObj = useRef(null)

  const [latest, setLatest]   = useState({ suhu: null, humid: null, timestamp: null, status: 'Memuat...' })
  const [isOnline, setIsOnline] = useState(null) // null=loading, true=ok, false=error

  // ── Inisialisasi Chart setelah mount ─────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return

    import('chart.js/auto').then(({ default: Chart }) => {
      const commonOptions = {
        responsive: true,
        animation: { duration: 400 },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: '#94a3b8', maxTicksLimit: 8, font: { size: 11 } },
            grid:  { color: '#1e293b' },
          },
          y: {
            ticks: { color: '#94a3b8', font: { size: 11 } },
            grid:  { color: '#334155' },
          },
        },
      }

      chartSuhuObj.current = new Chart(chartSuhuRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Suhu (°C)',
            data: [],
            borderColor: '#f87171',
            backgroundColor: 'rgba(248,113,113,0.12)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.4,
            fill: true,
          }],
        },
        options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, min: 0, max: 50 } } },
      })

      chartHumidObj.current = new Chart(chartHumidRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Kelembaban (%)',
            data: [],
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96,165,250,0.12)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.4,
            fill: true,
          }],
        },
        options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, min: 0, max: 100 } } },
      })

      // Load riwayat saat pertama buka
      fetch('/api/data')
        .then(r => r.json())
        .then(history => {
          if (!Array.isArray(history)) return
          history.forEach(d => addPoint(d.timestamp, d.suhu, d.humid))
          if (history.length > 0) {
            const last = history[history.length - 1]
            setLatest(prev => ({ ...prev, suhu: last.suhu, humid: last.humid, timestamp: last.timestamp }))
          }
        })
        .catch(console.error)
    })

    return () => {
      chartSuhuObj.current?.destroy()
      chartHumidObj.current?.destroy()
    }
  }, [])

  // ── Tambah titik ke chart ─────────────────────────────────────────────────
  function addPoint(ts, suhu, humid) {
    const charts = [chartSuhuObj.current, chartHumidObj.current]
    charts.forEach(ch => {
      if (!ch) return
      if (ch.data.labels.length >= MAX_POINTS) {
        ch.data.labels.shift()
        ch.data.datasets[0].data.shift()
      }
    })
    if (chartSuhuObj.current) {
      chartSuhuObj.current.data.labels.push(ts)
      chartSuhuObj.current.data.datasets[0].data.push(suhu)
      chartSuhuObj.current.update()
    }
    if (chartHumidObj.current) {
      chartHumidObj.current.data.labels.push(ts)
      chartHumidObj.current.data.datasets[0].data.push(humid)
      chartHumidObj.current.update()
    }
  }

  // ── Polling setiap 5 detik ────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res  = await fetch('/api/latest')
        const data = await res.json()
        if (data.suhu !== null) {
          setLatest(data)
          setIsOnline(data.diffSeconds <= 60)
          addPoint(data.timestamp, data.suhu, data.humid)
        } else {
          setLatest(prev => ({ ...prev, status: data.status || 'Belum ada data' }))
          setIsOnline(false)
        }
      } catch {
        setIsOnline(false)
        setLatest(prev => ({ ...prev, status: '❌ Tidak dapat terhubung ke server' }))
      }
    }

    const interval = setInterval(poll, 5000)
    poll() // langsung poll pertama kali
    return () => clearInterval(interval)
  }, [])

  // ── Warna status ──────────────────────────────────────────────────────────
  const dotColor = isOnline === null ? '#f59e0b' : isOnline ? '#22c55e' : '#ef4444'

  return (
    <>
      <Head>
        <title>Pemantauan Suhu Real-Time</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', Tahoma, sans-serif;
          background: #0f172a;
          color: #e2e8f0;
          min-height: 100vh;
          padding: 24px 16px;
        }
        header { text-align: center; margin-bottom: 28px; }
        header h1 { font-size: 1.75rem; font-weight: 700; color: #38bdf8; letter-spacing: 1px; }
        header p  { font-size: 0.82rem; color: #94a3b8; margin-top: 6px; }

        .status-bar {
          display: flex; align-items: center; gap: 8px;
          background: #1e293b; border: 1px solid #334155;
          border-radius: 8px; padding: 10px 16px;
          margin-bottom: 24px; font-size: 0.84rem;
        }
        .dot {
          width: 10px; height: 10px; border-radius: 50%;
          flex-shrink: 0; transition: background .4s;
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 16px; margin-bottom: 28px;
        }
        .card {
          background: #1e293b; border: 1px solid #334155;
          border-radius: 12px; padding: 20px; text-align: center;
          transition: transform .2s;
        }
        .card:hover { transform: translateY(-3px); }
        .card .label { font-size: .72rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .card .value { font-size: 2.3rem; font-weight: 700; }
        .card .unit  { font-size: .9rem; color: #94a3b8; }
        .card.suhu  .value { color: #f87171; }
        .card.humid .value { color: #60a5fa; }
        .card.time  .value { font-size: 1.3rem; color: #a78bfa; }

        .chart-box {
          background: #1e293b; border: 1px solid #334155;
          border-radius: 12px; padding: 20px; margin-bottom: 20px;
        }
        .chart-box h2 { font-size: .85rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px; }

        footer { text-align: center; font-size: .75rem; color: #475569; margin-top: 8px; }
      `}</style>

      <header>
        <h1>🌡️ Pemantauan Suhu Real-Time</h1>
        <p>ESP8266 + DHT11 | Data diperbarui setiap 5 detik</p>
      </header>

      {/* Status Bar */}
      <div className="status-bar">
        <div className="dot" style={{ background: dotColor, animation: isOnline === null ? 'pulse 1.5s infinite' : 'none' }} />
        <span>{latest.status || 'Menghubungkan...'}</span>
      </div>

      {/* Kartu Nilai */}
      <div className="cards">
        <div className="card suhu">
          <div className="label">🌡 Suhu</div>
          <div className="value">{latest.suhu !== null ? Number(latest.suhu).toFixed(1) : '--'}</div>
          <div className="unit">°C</div>
        </div>
        <div className="card humid">
          <div className="label">💧 Kelembaban</div>
          <div className="value">{latest.humid !== null ? Number(latest.humid).toFixed(1) : '--'}</div>
          <div className="unit">%</div>
        </div>
        <div className="card time">
          <div className="label">🕐 Update Terakhir</div>
          <div className="value">{latest.timestamp || '--:--:--'}</div>
        </div>
      </div>

      {/* Grafik Suhu */}
      <div className="chart-box">
        <h2>📈 Grafik Suhu (°C)</h2>
        <canvas ref={chartSuhuRef} height={90} />
      </div>

      {/* Grafik Kelembaban */}
      <div className="chart-box">
        <h2>📊 Grafik Kelembaban (%)</h2>
        <canvas ref={chartHumidRef} height={90} />
      </div>

      <footer>
        ESP8266 DHT11 → Vercel API → Supabase | Interval polling: 5 detik
      </footer>
    </>
  )
}
