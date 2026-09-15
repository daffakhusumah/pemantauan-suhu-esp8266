// pages/index.js
// Dashboard Pemantauan Suhu Server — RS Fatmawati
// Tab: Real-Time | Grafik Mingguan | Laporan Bulanan

import Head from 'next/head'
import { useEffect, useRef, useState, useCallback } from 'react'

// ─── Konstanta ────────────────────────────────────────────────────────────────
const SUHU_WARNING = 25   // °C kuning
const SUHU_DANGER  = 27   // °C merah
const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember']

// ─── Helper ──────────────────────────────────────────────────────────────────
function suhuColor(s) {
  if (s === null || s === undefined) return '#94a3b8'
  if (s > SUHU_DANGER)  return '#ef4444'
  if (s > SUHU_WARNING) return '#f59e0b'
  return '#22c55e'
}
function suhuBg(s) {
  if (s === null || s === undefined) return 'rgba(148,163,184,0.1)'
  if (s > SUHU_DANGER)  return 'rgba(239,68,68,0.12)'
  if (s > SUHU_WARNING) return 'rgba(245,158,11,0.12)'
  return 'rgba(34,197,94,0.12)'
}
function suhuEmoji(s) {
  if (s === null) return '❓'
  if (s > SUHU_DANGER)  return '🔴'
  if (s > SUHU_WARNING) return '⚠️'
  return '✅'
}

// ─── Komponen Utama ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab]       = useState('realtime')
  const [latest, setLatest] = useState({ suhu: null, humid: null, timestamp: null, status: 'Memuat...' })
  const [isOnline, setIsOnline] = useState(null)

  // Weekly
  const [weekly, setWeekly]   = useState([])
  const chartSuhuRef  = useRef(null)
  const chartHumidRef = useRef(null)
  const chartSuhuObj  = useRef(null)
  const chartHumidObj = useRef(null)
  const chartInited   = useRef(false)

  // Monthly
  const now = new Date()
  const [selYear,  setSelYear]  = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [monthly,  setMonthly]  = useState(null)
  const [loadingM, setLoadingM] = useState(false)

  // ── Polling real-time ───────────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/latest')
        const d = await r.json()
        if (d.suhu !== null && d.suhu !== undefined) {
          setLatest(d)
          setIsOnline(d.diffSeconds <= 60)
        } else {
          setLatest(p => ({ ...p, status: d.status || 'Belum ada data' }))
          setIsOnline(false)
        }
      } catch { setIsOnline(false) }
    }
    const iv = setInterval(poll, 5000)
    poll()
    return () => clearInterval(iv)
  }, [])

  // ── Load weekly data ────────────────────────────────────────────────────────
  const loadWeekly = useCallback(async () => {
    try {
      const r = await fetch('/api/weekly')
      const d = await r.json()
      setWeekly(Array.isArray(d) ? d : [])
    } catch { setWeekly([]) }
  }, [])

  useEffect(() => {
    if (tab === 'weekly') loadWeekly()
  }, [tab, loadWeekly])

  // ── Init & update charts ────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'weekly' || !chartSuhuRef.current || !chartHumidRef.current) return

    import('chart.js/auto').then(({ default: Chart }) => {
      if (chartInited.current) {
        // Update existing charts
        if (chartSuhuObj.current && chartHumidObj.current) {
          const labels = weekly.map(d => d.label)
          chartSuhuObj.current.data.labels = labels
          chartSuhuObj.current.data.datasets[0].data = weekly.map(d => d.avg_suhu)
          chartSuhuObj.current.update()
          chartHumidObj.current.data.labels = labels
          chartHumidObj.current.data.datasets[0].data = weekly.map(d => d.avg_humid)
          chartHumidObj.current.update()
        }
        return
      }

      const commonOpt = {
        responsive: true,
        animation: { duration: 500 },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#1e293b' } },
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#334155' } },
        },
      }

      chartSuhuObj.current = new Chart(chartSuhuRef.current, {
        type: 'line',
        data: {
          labels: weekly.map(d => d.label),
          datasets: [{
            label: 'Rata-rata Suhu (°C)',
            data: weekly.map(d => d.avg_suhu),
            borderColor: '#f87171',
            backgroundColor: 'rgba(248,113,113,0.12)',
            borderWidth: 2, pointRadius: 5, tension: 0.3, fill: true, spanGaps: true,
          }, {
            label: 'Batas Aman (25°C)',
            data: weekly.map(() => SUHU_WARNING),
            borderColor: '#f59e0b',
            borderWidth: 1, borderDash: [6, 4], pointRadius: 0,
            fill: false,
          }],
        },
        options: { ...commonOpt, scales: { ...commonOpt.scales, y: { ...commonOpt.scales.y, min: 15, max: 35 } } },
      })

      chartHumidObj.current = new Chart(chartHumidRef.current, {
        type: 'bar',
        data: {
          labels: weekly.map(d => d.label),
          datasets: [{
            label: 'Rata-rata Kelembaban (%)',
            data: weekly.map(d => d.avg_humid),
            backgroundColor: 'rgba(96,165,250,0.6)',
            borderColor: '#60a5fa',
            borderWidth: 1, borderRadius: 4,
          }],
        },
        options: { ...commonOpt, scales: { ...commonOpt.scales, y: { ...commonOpt.scales.y, min: 0, max: 100 } } },
      })
      chartInited.current = true
    })
  }, [tab, weekly])

  // ── Load monthly ────────────────────────────────────────────────────────────
  const loadMonthly = useCallback(async (y, m) => {
    setLoadingM(true)
    try {
      const r = await fetch(`/api/monthly?year=${y}&month=${m}`)
      const d = await r.json()
      setMonthly(d)
    } catch { setMonthly(null) }
    setLoadingM(false)
  }, [])

  useEffect(() => {
    if (tab === 'monthly') loadMonthly(selYear, selMonth)
  }, [tab, selYear, selMonth, loadMonthly])

  const prevMonth = () => {
    if (selMonth === 1) { setSelYear(y => y - 1); setSelMonth(12) }
    else setSelMonth(m => m - 1)
  }
  const nextMonth = () => {
    const n = new Date()
    if (selYear > n.getFullYear() || (selYear === n.getFullYear() && selMonth >= n.getMonth() + 1)) return
    if (selMonth === 12) { setSelYear(y => y + 1); setSelMonth(1) }
    else setSelMonth(m => m + 1)
  }

  // ── Print ───────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print()

  // ── Dot status ──────────────────────────────────────────────────────────────
  const dotColor = isOnline === null ? '#f59e0b' : isOnline ? '#22c55e' : '#ef4444'

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>Pemantauan Suhu Server — RS Fatmawati</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', Tahoma, sans-serif;
          background: #0f172a; color: #e2e8f0;
          min-height: 100vh;
        }

        /* ── Header ── */
        .header {
          background: #1e293b;
          border-bottom: 1px solid #334155;
          padding: 16px 24px;
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 12px;
        }
        .header-left h1 { font-size: 1.15rem; font-weight: 700; color: #38bdf8; }
        .header-left p  { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
        .status-pill {
          display: flex; align-items: center; gap: 6px;
          background: #0f172a; border: 1px solid #334155;
          border-radius: 20px; padding: 6px 14px;
          font-size: 0.78rem;
        }
        .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        /* ── Tabs ── */
        .tabs {
          display: flex; gap: 2px;
          background: #1e293b; border-bottom: 1px solid #334155;
          padding: 0 24px;
        }
        .tab-btn {
          padding: 12px 20px; font-size: 0.85rem; font-weight: 500;
          border: none; background: none; color: #94a3b8;
          cursor: pointer; border-bottom: 2px solid transparent;
          transition: all .2s;
        }
        .tab-btn.active { color: #38bdf8; border-bottom-color: #38bdf8; }
        .tab-btn:hover:not(.active) { color: #e2e8f0; }

        /* ── Content ── */
        .content { padding: 24px; max-width: 1100px; margin: 0 auto; }

        /* ── Cards ── */
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .card {
          background: #1e293b; border: 1px solid #334155;
          border-radius: 12px; padding: 20px; text-align: center;
          transition: transform .2s;
        }
        .card:hover { transform: translateY(-3px); }
        .card .label { font-size: .72rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .card .value { font-size: 2.4rem; font-weight: 700; }
        .card .unit  { font-size: .9rem; color: #94a3b8; margin-top: 2px; }

        /* ── Alert ── */
        .alert {
          display: flex; align-items: center; gap: 10px;
          border-radius: 8px; padding: 12px 16px;
          margin-bottom: 20px; font-size: .875rem; font-weight: 500;
        }
        .alert.danger  { background: rgba(239,68,68,.15);  border: 1px solid #ef4444; color: #fca5a5; }
        .alert.warning { background: rgba(245,158,11,.15); border: 1px solid #f59e0b; color: #fcd34d; }
        .alert.ok      { background: rgba(34,197,94,.12);  border: 1px solid #22c55e; color: #86efac; }

        /* ── Chart box ── */
        .chart-box {
          background: #1e293b; border: 1px solid #334155;
          border-radius: 12px; padding: 20px; margin-bottom: 20px;
        }
        .chart-box h2 { font-size: .82rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px; }

        /* ── Monthly table ── */
        .month-nav {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 16px; flex-wrap: wrap;
        }
        .month-nav .title { font-size: 1rem; font-weight: 600; color: #38bdf8; flex: 1; }
        .nav-btn {
          padding: 6px 14px; border: 1px solid #334155;
          background: #1e293b; color: #e2e8f0;
          border-radius: 6px; cursor: pointer; font-size: .85rem;
          transition: background .2s;
        }
        .nav-btn:hover { background: #334155; }
        .nav-btn:disabled { opacity: .4; cursor: not-allowed; }
        .print-btn {
          padding: 6px 16px; border: none;
          background: #0ea5e9; color: #fff;
          border-radius: 6px; cursor: pointer; font-size: .85rem;
          transition: background .2s;
        }
        .print-btn:hover { background: #0284c7; }

        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: .82rem; }
        thead th {
          background: #1e293b; padding: 10px 8px;
          text-align: center; color: #94a3b8;
          font-size: .72rem; text-transform: uppercase; letter-spacing: .5px;
          border-bottom: 1px solid #334155; white-space: nowrap;
        }
        tbody tr { border-bottom: 1px solid #1e293b; }
        tbody tr:nth-child(even) { background: rgba(30,41,59,.4); }
        tbody tr:hover { background: rgba(56,189,248,.06); }
        tbody td { padding: 9px 8px; text-align: center; white-space: nowrap; }
        .td-date { font-weight: 600; color: #cbd5e1; text-align: left; padding-left: 12px; }
        .td-nodata { color: #475569; font-style: italic; }
        .suhu-val { font-weight: 600; }
        .humid-val { color: #60a5fa; }

        /* ── Legend ── */
        .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; font-size: .78rem; }
        .legend-item { display: flex; align-items: center; gap: 6px; }

        /* ── Footer ── */
        footer { text-align: center; font-size: .72rem; color: #475569; padding: 16px; }

        /* ── PRINT STYLES ── */
        @media print {
          body { background: #fff !important; color: #000 !important; }
          .header { background: #fff !important; border-bottom: 2px solid #000 !important; }
          .header-left h1 { color: #000 !important; }
          .header-left p  { color: #444 !important; }
          .status-pill, .tabs, .print-btn, footer { display: none !important; }
          .content { padding: 0 !important; }
          .month-nav .title { color: #000 !important; }
          .nav-btn { display: none !important; }
          table { font-size: .75rem !important; }
          thead th { background: #f0f0f0 !important; color: #000 !important; border: 1px solid #ccc !important; }
          tbody td { border: 1px solid #ddd !important; color: #000 !important; }
          tbody tr:nth-child(even) { background: #f9f9f9 !important; }
          .suhu-val, .humid-val { color: #000 !important; }
          .print-title { display: block !important; }
        }
        .print-title { display: none; text-align: center; font-size: 1rem; font-weight: 700; margin-bottom: 8px; }
      `}</style>

      {/* ── Header ── */}
      <div className="header no-print">
        <div className="header-left">
          <h1>🌡️ Pemantauan Suhu Server — RS Fatmawati</h1>
          <p>ESP8266 + DHT11 | Sistem Monitoring Otomatis 24 Jam</p>
        </div>
        <div className="status-pill">
          <div className="dot" style={{ background: dotColor }} />
          <span>{latest.status || 'Menghubungkan...'}</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="tabs no-print">
        {[
          { key: 'realtime', label: '📡 Real-Time' },
          { key: 'weekly',   label: '📈 Grafik Mingguan' },
          { key: 'monthly',  label: '📋 Laporan Bulanan' },
        ].map(t => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="content">

        {/* ════════════════════════════════════════════
            TAB 1 — REAL-TIME
        ════════════════════════════════════════════ */}
        {tab === 'realtime' && (
          <>
            {/* Alert suhu */}
            {latest.suhu !== null && (
              <div className={`alert ${latest.suhu > SUHU_DANGER ? 'danger' : latest.suhu > SUHU_WARNING ? 'warning' : 'ok'}`}>
                <span style={{ fontSize: '1.2rem' }}>{suhuEmoji(latest.suhu)}</span>
                {latest.suhu > SUHU_DANGER
                  ? `SUHU BERBAHAYA! ${latest.suhu}°C melebihi batas aman (${SUHU_DANGER}°C). Segera periksa pendingin!`
                  : latest.suhu > SUHU_WARNING
                  ? `Suhu mendekati batas aman: ${latest.suhu}°C. Pantau secara berkala.`
                  : `Suhu normal: ${latest.suhu}°C. Semua sistem berjalan baik.`}
              </div>
            )}

            {/* Kartu nilai */}
            <div className="cards">
              <div className="card" style={{ borderColor: suhuColor(latest.suhu) }}>
                <div className="label">🌡 Suhu Ruangan</div>
                <div className="value" style={{ color: suhuColor(latest.suhu) }}>
                  {latest.suhu !== null ? Number(latest.suhu).toFixed(1) : '--'}
                </div>
                <div className="unit">°C</div>
              </div>
              <div className="card">
                <div className="label">💧 Kelembaban</div>
                <div className="value" style={{ color: '#60a5fa' }}>
                  {latest.humid !== null ? Number(latest.humid).toFixed(1) : '--'}
                </div>
                <div className="unit">%</div>
              </div>
              <div className="card">
                <div className="label">🕐 Update Terakhir</div>
                <div className="value" style={{ fontSize: '1.3rem', color: '#a78bfa' }}>
                  {latest.timestamp || '--:--:--'}
                </div>
              </div>
            </div>

            {/* Info batas suhu */}
            <div className="legend">
              <div className="legend-item"><span style={{color:'#22c55e'}}>✅</span> Normal (≤ {SUHU_WARNING}°C)</div>
              <div className="legend-item"><span style={{color:'#f59e0b'}}>⚠️</span> Perhatian ({SUHU_WARNING}–{SUHU_DANGER}°C)</div>
              <div className="legend-item"><span style={{color:'#ef4444'}}>🔴</span> Bahaya ({'>'} {SUHU_DANGER}°C)</div>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════
            TAB 2 — GRAFIK MINGGUAN
        ════════════════════════════════════════════ */}
        {tab === 'weekly' && (
          <>
            <div className="chart-box">
              <h2>📈 Rata-rata Suhu Per Hari — 7 Hari Terakhir</h2>
              <canvas ref={chartSuhuRef} height={100} />
            </div>
            <div className="chart-box">
              <h2>📊 Rata-rata Kelembaban Per Hari — 7 Hari Terakhir</h2>
              <canvas ref={chartHumidRef} height={100} />
            </div>
            <div className="legend">
              <div className="legend-item"><span style={{color:'#f87171'}}>──</span> Suhu rata-rata harian</div>
              <div className="legend-item"><span style={{color:'#f59e0b'}}>- -</span> Batas aman ({SUHU_WARNING}°C)</div>
            </div>
            {weekly.length > 0 && (
              <div className="chart-box">
                <h2>📅 Ringkasan 7 Hari</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Hari</th>
                        <th>Avg Suhu</th>
                        <th>Avg Humid</th>
                        <th>Jumlah Data</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekly.map(d => (
                        <tr key={d.tanggal}>
                          <td className="td-date">{d.label}</td>
                          <td className="suhu-val" style={{ color: suhuColor(d.avg_suhu) }}>
                            {d.avg_suhu !== null ? `${d.avg_suhu}°C` : '-'}
                          </td>
                          <td className="humid-val">{d.avg_humid !== null ? `${d.avg_humid}%` : '-'}</td>
                          <td style={{ color: '#94a3b8' }}>{d.count} data</td>
                          <td>{suhuEmoji(d.avg_suhu)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════
            TAB 3 — LAPORAN BULANAN
        ════════════════════════════════════════════ */}
        {tab === 'monthly' && (
          <>
            {/* Judul untuk print */}
            <div className="print-title">
              Laporan Suhu Server RS Fatmawati — {monthly?.nama_bulan}
            </div>

            {/* Navigasi bulan */}
            <div className="month-nav no-print">
              <button className="nav-btn" onClick={prevMonth}>← Prev</button>
              <span className="title">
                📋 {BULAN_ID[selMonth - 1]} {selYear}
              </span>
              <button className="nav-btn" onClick={nextMonth}
                disabled={selYear === now.getFullYear() && selMonth >= now.getMonth() + 1}>
                Next →
              </button>
              <button className="print-btn" onClick={handlePrint}>🖨️ Print / PDF</button>
            </div>

            {loadingM ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>⏳ Memuat laporan...</div>
            ) : monthly ? (
              <>
                <div className="legend no-print" style={{ marginBottom: '12px' }}>
                  <div className="legend-item"><span style={{color:'#22c55e'}}>✅</span> Normal (≤ {SUHU_WARNING}°C)</div>
                  <div className="legend-item"><span style={{color:'#f59e0b'}}>⚠️</span> Perhatian ({SUHU_WARNING}–{SUHU_DANGER}°C)</div>
                  <div className="legend-item"><span style={{color:'#ef4444'}}>🔴</span> Bahaya ({'>'} {SUHU_DANGER}°C)</div>
                  <div className="legend-item" style={{marginLeft:'auto', color:'#94a3b8', fontSize:'.75rem'}}>
                    Pagi ≈ 08:00 WIB | Malam ≈ 20:00 WIB
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ textAlign: 'left', paddingLeft: '12px' }}>Tanggal</th>
                        <th colSpan={4} style={{ borderBottom: '1px solid #475569', color: '#fbbf24' }}>🌅 Pagi</th>
                        <th colSpan={4} style={{ borderBottom: '1px solid #475569', color: '#818cf8' }}>🌙 Malam</th>
                      </tr>
                      <tr>
                        <th>Waktu</th><th>Suhu</th><th>Humid</th><th>Ket</th>
                        <th>Waktu</th><th>Suhu</th><th>Humid</th><th>Ket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.data.map(row => {
                        const isToday = row.tanggal === new Date().toISOString().slice(0,10)
                        return (
                          <tr key={row.tanggal} style={isToday ? { background: 'rgba(56,189,248,.08)' } : {}}>
                            <td className="td-date">
                              {row.hari} {BULAN_ID[selMonth-1].slice(0,3)}
                              {isToday && <span style={{color:'#38bdf8',marginLeft:4,fontSize:'.7rem'}}>●</span>}
                            </td>
                            {row.has_data ? (
                              <>
                                {/* Pagi */}
                                <td style={{ color: '#fbbf24', fontSize: '.8rem' }}>{row.waktu_pagi}</td>
                                <td className="suhu-val" style={{ color: suhuColor(row.suhu_pagi) }}>
                                  {row.suhu_pagi !== null ? `${row.suhu_pagi}°C` : '-'}
                                </td>
                                <td className="humid-val">
                                  {row.humid_pagi !== null ? `${row.humid_pagi}%` : '-'}
                                </td>
                                <td>{row.status_pagi}</td>
                                {/* Malam */}
                                <td style={{ color: '#818cf8', fontSize: '.8rem' }}>{row.waktu_malam}</td>
                                <td className="suhu-val" style={{ color: suhuColor(row.suhu_malam) }}>
                                  {row.suhu_malam !== null ? `${row.suhu_malam}°C` : '-'}
                                </td>
                                <td className="humid-val">
                                  {row.humid_malam !== null ? `${row.humid_malam}%` : '-'}
                                </td>
                                <td>{row.status_malam}</td>
                              </>
                            ) : (
                              <td colSpan={8} className="td-nodata">— Tidak ada data —</td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Ringkasan */}
                {(() => {
                  const rows = monthly.data.filter(r => r.has_data)
                  const allSuhu = [...rows.map(r=>r.suhu_pagi), ...rows.map(r=>r.suhu_malam)].filter(Boolean)
                  const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1) : '-'
                  const max = arr => arr.length ? Math.max(...arr).toFixed(1) : '-'
                  const min = arr => arr.length ? Math.min(...arr).toFixed(1) : '-'
                  return (
                    <div className="cards" style={{ marginTop: '20px' }}>
                      <div className="card">
                        <div className="label">📊 Rata-rata Suhu</div>
                        <div className="value" style={{ color: suhuColor(parseFloat(avg(allSuhu))), fontSize:'1.8rem' }}>{avg(allSuhu)}°C</div>
                      </div>
                      <div className="card">
                        <div className="label">🔺 Suhu Tertinggi</div>
                        <div className="value" style={{ color: '#ef4444', fontSize:'1.8rem' }}>{max(allSuhu)}°C</div>
                      </div>
                      <div className="card">
                        <div className="label">🔻 Suhu Terendah</div>
                        <div className="value" style={{ color: '#22c55e', fontSize:'1.8rem' }}>{min(allSuhu)}°C</div>
                      </div>
                      <div className="card">
                        <div className="label">📅 Hari Tercatat</div>
                        <div className="value" style={{ color: '#a78bfa', fontSize:'1.8rem' }}>{rows.length}</div>
                        <div className="unit">dari {monthly.total_hari} hari</div>
                      </div>
                    </div>
                  )
                })()}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Gagal memuat laporan.</div>
            )}
          </>
        )}
      </div>

      <footer className="no-print">
        RS Fatmawati | Server Room Monitoring | ESP8266 + DHT11 → Vercel + Supabase
      </footer>
    </>
  )
}
