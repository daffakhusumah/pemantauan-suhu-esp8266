// pages/index.js
// Dashboard Pemantauan Suhu Server — RS Fatmawati
// Tab: Real-Time | Grafik Mingguan | Laporan Bulanan

import Head from 'next/head'
import { useEffect, useRef, useState, useCallback } from 'react'

// ─── Konstanta ────────────────────────────────────────────────────────────────
const SUHU_WARNING = 25
const SUHU_DANGER  = 27
const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember']

// ─── Helper ───────────────────────────────────────────────────────────────────
const suhuColor = s => !s && s !== 0 ? '#94a3b8' : s > SUHU_DANGER ? '#ef4444' : s > SUHU_WARNING ? '#f59e0b' : '#22c55e'
const suhuEmoji = s => s === null || s === undefined ? '❓' : s > SUHU_DANGER ? '🔴' : s > SUHU_WARNING ? '⚠️' : '✅'

// ─── Chart helpers ────────────────────────────────────────────────────────────
const commonAxis = {
  x: { ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 45 }, grid: { color: '#1e293b' } },
  y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#334155' } },
}

// ─── Komponen Utama ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab]         = useState('realtime')
  const [latest, setLatest]   = useState({ suhu: null, humid: null, timestamp: null, status: 'Memuat...' })
  const [isOnline, setIsOnline] = useState(null)

  // ── Daily chart refs (Real-Time tab) ─────────────────────────────────────
  const dailySuhuRef   = useRef(null)
  const dailyHumidRef  = useRef(null)
  const dailySuhuObj   = useRef(null)
  const dailyHumidObj  = useRef(null)
  const [dailyData, setDailyData] = useState([])

  // ── Weekly chart refs ────────────────────────────────────────────────────
  const [weekly, setWeekly]     = useState([])
  const weekSuhuRef   = useRef(null)
  const weekHumidRef  = useRef(null)
  const weekSuhuObj   = useRef(null)
  const weekHumidObj  = useRef(null)

  // ── Monthly ──────────────────────────────────────────────────────────────
  const now = new Date()
  const [selYear,  setSelYear]  = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [monthly,  setMonthly]  = useState(null)
  const [loadingM, setLoadingM] = useState(false)
  // Monthly chart refs
  const monthSuhuRef  = useRef(null)
  const monthHumidRef = useRef(null)
  const monthSuhuObj  = useRef(null)
  const monthHumidObj = useRef(null)

  // ── Signature state (editable & saved to localStorage) ───────────────────
  const [showSigModal, setShowSigModal] = useState(false)
  const defaultSignatures = {
    showPelaksana: false,
    pelaksana1: { label: 'Pelaksana / Teknisi TI', nama: 'Satrio Abdi Negoro', nip: 'NIP. -' },
    pelaksana2: { label: 'Petugas Monitoring', nama: 'Daffa Ahmadhan Khusumah', nip: 'NIP. -' },
    pejabat1: { status: 'Mengetahui,', jabatan: 'Kepala Instalasi SIMRS', nama: 'dr. Dany Kurniadi Ramdhan, Sp. B.S', nip: 'NIP. -' },
    pejabat2: { status: 'Mengetahui,', jabatan: 'Waka Sub Perangkat & Jaringan TI', nama: 'Dzakiah Nur Fadhilah, S.Kom', nip: 'NIP. -' },
  }
  const [signatures, setSignatures] = useState(defaultSignatures)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('fatmawati_signatures_v3')
      if (saved) {
        setSignatures(JSON.parse(saved))
      }
    } catch (_) {}
  }, [])

  const updateSig = (category, field, val) => {
    setSignatures(prev => {
      let updated
      if (field === null) {
        updated = { ...prev, [category]: val }
      } else {
        updated = {
          ...prev,
          [category]: {
            ...prev[category],
            [field]: val,
          },
        }
      }
      try {
        localStorage.setItem('fatmawati_signatures_v3', JSON.stringify(updated))
      } catch (_) {}
      return updated
    })
  }

  const resetSignatures = () => {
    setSignatures(defaultSignatures)
    try {
      localStorage.setItem('fatmawati_signatures_v3', JSON.stringify(defaultSignatures))
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP CHARTS ON TAB SWITCH
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    return () => {
      if (dailySuhuObj.current)  { try { dailySuhuObj.current.destroy() } catch (_) {} dailySuhuObj.current = null }
      if (dailyHumidObj.current) { try { dailyHumidObj.current.destroy() } catch (_) {} dailyHumidObj.current = null }
      if (weekSuhuObj.current)   { try { weekSuhuObj.current.destroy() } catch (_) {} weekSuhuObj.current = null }
      if (weekHumidObj.current)  { try { weekHumidObj.current.destroy() } catch (_) {} weekHumidObj.current = null }
      if (monthSuhuObj.current)  { try { monthSuhuObj.current.destroy() } catch (_) {} monthSuhuObj.current = null }
      if (monthHumidObj.current) { try { monthHumidObj.current.destroy() } catch (_) {} monthHumidObj.current = null }
    }
  }, [tab])

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING REAL-TIME
  // ═══════════════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY DATA (60 titik terakhir)
  // ═══════════════════════════════════════════════════════════════════════════
  const loadDaily = useCallback(async () => {
    try {
      const r = await fetch('/api/data')
      const d = await r.json()
      setDailyData(Array.isArray(d) ? d : [])
    } catch { setDailyData([]) }
  }, [])

  // Load + auto-refresh daily tiap 10 detik saat di tab realtime
  useEffect(() => {
    if (tab !== 'realtime') return
    loadDaily()
    const iv = setInterval(loadDaily, 10000)
    return () => clearInterval(iv)
  }, [tab, loadDaily])

  // ── Init / update daily charts ────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'realtime' || !dailySuhuRef.current || !dailyHumidRef.current) return
    if (dailyData.length === 0) return

    let isMounted = true

    import('chart.js/auto').then(({ default: Chart }) => {
      if (!isMounted) return
      if (!dailySuhuRef.current || !dailyHumidRef.current) return

      const labels = dailyData.map(d => d.timestamp)
      const suhuVals = dailyData.map(d => d.suhu)
      const humidVals = dailyData.map(d => d.humid)

      const isSuhuValid = dailySuhuObj.current && dailySuhuObj.current.canvas === dailySuhuRef.current
      const isHumidValid = dailyHumidObj.current && dailyHumidObj.current.canvas === dailyHumidRef.current

      if (isSuhuValid && isHumidValid) {
        dailySuhuObj.current.data.labels = labels
        dailySuhuObj.current.data.datasets[0].data = suhuVals
        dailySuhuObj.current.update('none')
        dailyHumidObj.current.data.labels = labels
        dailyHumidObj.current.data.datasets[0].data = humidVals
        dailyHumidObj.current.update('none')
        return
      }

      if (dailySuhuObj.current)  { try { dailySuhuObj.current.destroy() } catch (_) {} dailySuhuObj.current = null }
      if (dailyHumidObj.current) { try { dailyHumidObj.current.destroy() } catch (_) {} dailyHumidObj.current = null }

      dailySuhuObj.current = new Chart(dailySuhuRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Suhu (°C)',
            data: suhuVals,
            borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.1)',
            borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true, spanGaps: true,
          }, {
            label: `Batas (${SUHU_WARNING}°C)`,
            data: labels.map(() => SUHU_WARNING),
            borderColor: '#f59e0b', borderWidth: 1, borderDash: [6,4], pointRadius: 0, fill: false,
          }],
        },
        options: {
          responsive: true, animation: false,
          plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
          scales: { ...commonAxis, y: { ...commonAxis.y, min: 15, max: 40 } },
        },
      })

      dailyHumidObj.current = new Chart(dailyHumidRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Kelembaban (%)',
            data: humidVals,
            borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.1)',
            borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true, spanGaps: true,
          }],
        },
        options: {
          responsive: true, animation: false,
          plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
          scales: { ...commonAxis, y: { ...commonAxis.y, min: 0, max: 100 } },
        },
      })
    })

    return () => {
      isMounted = false
    }
  }, [tab, dailyData])

  // ═══════════════════════════════════════════════════════════════════════════
  // WEEKLY
  // ═══════════════════════════════════════════════════════════════════════════
  const loadWeekly = useCallback(async () => {
    try {
      const r = await fetch('/api/weekly')
      const d = await r.json()
      setWeekly(Array.isArray(d) ? d : [])
    } catch { setWeekly([]) }
  }, [])

  useEffect(() => { if (tab === 'weekly') loadWeekly() }, [tab, loadWeekly])

  useEffect(() => {
    if (tab !== 'weekly' || !weekSuhuRef.current || !weekHumidRef.current || weekly.length === 0) return
    let isMounted = true

    import('chart.js/auto').then(({ default: Chart }) => {
      if (!isMounted) return
      if (!weekSuhuRef.current || !weekHumidRef.current) return

      const labels     = weekly.map(d => d.label)
      const suhuVals   = weekly.map(d => d.avg_suhu)
      const humidVals  = weekly.map(d => d.avg_humid)

      const isSuhuValid = weekSuhuObj.current && weekSuhuObj.current.canvas === weekSuhuRef.current
      const isHumidValid = weekHumidObj.current && weekHumidObj.current.canvas === weekHumidRef.current

      if (isSuhuValid && isHumidValid) {
        weekSuhuObj.current.data.labels = labels
        weekSuhuObj.current.data.datasets[0].data = suhuVals
        weekSuhuObj.current.update()
        weekHumidObj.current.data.labels = labels
        weekHumidObj.current.data.datasets[0].data = humidVals
        weekHumidObj.current.update()
        return
      }

      if (weekSuhuObj.current)  { try { weekSuhuObj.current.destroy() } catch (_) {} weekSuhuObj.current = null }
      if (weekHumidObj.current) { try { weekHumidObj.current.destroy() } catch (_) {} weekHumidObj.current = null }

      weekSuhuObj.current = new Chart(weekSuhuRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Avg Suhu (°C)', data: suhuVals,
            borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.12)',
            borderWidth: 2, pointRadius: 5, tension: 0.3, fill: true, spanGaps: true,
          }, {
            label: `Batas Aman (${SUHU_WARNING}°C)`,
            data: labels.map(() => SUHU_WARNING),
            borderColor: '#f59e0b', borderWidth: 1, borderDash: [6,4], pointRadius: 0, fill: false,
          }],
        },
        options: {
          responsive: true, animation: { duration: 500 },
          plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
          scales: { ...commonAxis, y: { ...commonAxis.y, min: 15, max: 35 } },
        },
      })

      weekHumidObj.current = new Chart(weekHumidRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Avg Kelembaban (%)', data: humidVals,
            backgroundColor: 'rgba(96,165,250,0.6)', borderColor: '#60a5fa',
            borderWidth: 1, borderRadius: 4,
          }],
        },
        options: {
          responsive: true, animation: { duration: 500 },
          plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
          scales: { ...commonAxis, y: { ...commonAxis.y, min: 0, max: 100 } },
        },
      })
    })

    return () => { isMounted = false }
  }, [tab, weekly])

  // ═══════════════════════════════════════════════════════════════════════════
  // MONTHLY
  // ═══════════════════════════════════════════════════════════════════════════
  const loadMonthly = useCallback(async (y, m) => {
    setLoadingM(true)
    try {
      const r = await fetch(`/api/monthly?year=${y}&month=${m}`)
      setMonthly(await r.json())
    } catch { setMonthly(null) }
    setLoadingM(false)
  }, [])

  useEffect(() => {
    if (tab === 'monthly') loadMonthly(selYear, selMonth)
  }, [tab, selYear, selMonth, loadMonthly])

  // ── Monthly charts (suhu & humid per hari) ───────────────────────────────
  useEffect(() => {
    if (tab !== 'monthly' || !monthly?.data || !monthSuhuRef.current || !monthHumidRef.current) return
    let isMounted = true

    import('chart.js/auto').then(({ default: Chart }) => {
      if (!isMounted) return
      if (!monthSuhuRef.current || !monthHumidRef.current) return

      const rows      = monthly.data.filter(r => r.has_data)
      const labels    = rows.map(r => `${r.hari}`)
      const suhuPagi  = rows.map(r => r.suhu_pagi)
      const suhuMalam = rows.map(r => r.suhu_malam)
      const humPagi   = rows.map(r => r.humid_pagi)
      const humMalam  = rows.map(r => r.humid_malam)

      const isSuhuValid = monthSuhuObj.current && monthSuhuObj.current.canvas === monthSuhuRef.current
      const isHumidValid = monthHumidObj.current && monthHumidObj.current.canvas === monthHumidRef.current

      if (isSuhuValid && isHumidValid) {
        const ds0 = monthSuhuObj.current.data.datasets
        monthSuhuObj.current.data.labels = labels
        ds0[0].data = suhuPagi; ds0[1].data = suhuMalam
        monthSuhuObj.current.update()
        const ds1 = monthHumidObj.current.data.datasets
        monthHumidObj.current.data.labels = labels
        ds1[0].data = humPagi; ds1[1].data = humMalam
        monthHumidObj.current.update()
        return
      }

      if (monthSuhuObj.current)  { try { monthSuhuObj.current.destroy() } catch (_) {} monthSuhuObj.current = null }
      if (monthHumidObj.current) { try { monthHumidObj.current.destroy() } catch (_) {} monthHumidObj.current = null }

      const lineOpt = {
        responsive: true, animation: { duration: 400 },
        plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      }

      monthSuhuObj.current = new Chart(monthSuhuRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: '🌅 Suhu Pagi', data: suhuPagi, borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.1)', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false, spanGaps: true },
            { label: '🌙 Suhu Malam', data: suhuMalam, borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,0.1)', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false, spanGaps: true },
            { label: `Batas (${SUHU_WARNING}°C)`, data: labels.map(() => SUHU_WARNING), borderColor: '#ef4444', borderWidth: 1, borderDash: [6,4], pointRadius: 0, fill: false },
          ],
        },
        options: { ...lineOpt, scales: { ...commonAxis, y: { ...commonAxis.y, min: 15, max: 35 } } },
      })

      monthHumidObj.current = new Chart(monthHumidRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: '🌅 Humid Pagi',  data: humPagi,  backgroundColor: 'rgba(251,191,36,0.5)', borderColor: '#fbbf24', borderWidth: 1, borderRadius: 3 },
            { label: '🌙 Humid Malam', data: humMalam, backgroundColor: 'rgba(129,140,248,0.5)', borderColor: '#818cf8', borderWidth: 1, borderRadius: 3 },
          ],
        },
        options: { ...lineOpt, scales: { ...commonAxis, y: { ...commonAxis.y, min: 0, max: 100 } } },
      })
    })

    return () => { isMounted = false }
  }, [tab, monthly, selYear, selMonth])

  const prevMonth = () => {
    if (selMonth === 1) { setSelYear(y => y-1); setSelMonth(12) }
    else setSelMonth(m => m-1)
  }
  const nextMonth = () => {
    const n = new Date()
    if (selYear === n.getFullYear() && selMonth >= n.getMonth()+1) return
    if (selMonth === 12) { setSelYear(y => y+1); setSelMonth(1) }
    else setSelMonth(m => m+1)
  }

  const dotColor = isOnline === null ? '#f59e0b' : isOnline ? '#22c55e' : '#ef4444'

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <Head>
        <title>Pemantauan Suhu Server — RS Fatmawati</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}

        .header{background:#1e293b;border-bottom:1px solid #334155;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
        .header h1{font-size:1.1rem;font-weight:700;color:#38bdf8}
        .header p{font-size:.73rem;color:#94a3b8;margin-top:2px}
        .status-pill{display:flex;align-items:center;gap:6px;background:#0f172a;border:1px solid #334155;border-radius:20px;padding:6px 14px;font-size:.78rem}
        .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}

        .tabs{display:flex;gap:2px;background:#1e293b;border-bottom:1px solid #334155;padding:0 24px}
        .tab-btn{padding:12px 20px;font-size:.85rem;font-weight:500;border:none;background:none;color:#94a3b8;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s}
        .tab-btn.active{color:#38bdf8;border-bottom-color:#38bdf8}
        .tab-btn:hover:not(.active){color:#e2e8f0}

        .content{padding:22px;max-width:1100px;margin:0 auto}

        .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:20px}
        .card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:18px;text-align:center;transition:transform .2s}
        .card:hover{transform:translateY(-2px)}
        .card .lbl{font-size:.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
        .card .val{font-size:2.2rem;font-weight:700}
        .card .unt{font-size:.85rem;color:#94a3b8;margin-top:2px}

        .alert{display:flex;align-items:center;gap:10px;border-radius:8px;padding:11px 15px;margin-bottom:18px;font-size:.875rem;font-weight:500}
        .alert.danger {background:rgba(239,68,68,.15); border:1px solid #ef4444;color:#fca5a5}
        .alert.warning{background:rgba(245,158,11,.15);border:1px solid #f59e0b;color:#fcd34d}
        .alert.ok     {background:rgba(34,197,94,.12); border:1px solid #22c55e;color:#86efac}

        .chart-box{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:18px;margin-bottom:18px}
        .chart-box h2{font-size:.78rem;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}

        .table-box{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:18px;margin-bottom:18px}
        .table-box h2{font-size:.78rem;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}

        .month-nav{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
        .month-nav .title{font-size:1rem;font-weight:600;color:#38bdf8;flex:1}
        .nav-btn{padding:5px 13px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;border-radius:6px;cursor:pointer;font-size:.83rem;transition:background .2s}
        .nav-btn:hover{background:#334155}
        .nav-btn:disabled{opacity:.4;cursor:not-allowed}
        .print-btn{padding:5px 15px;border:none;background:#0ea5e9;color:#fff;border-radius:6px;cursor:pointer;font-size:.83rem}
        .print-btn:hover{background:#0284c7}

        .table-wrap{overflow-x:auto}
        table{width:100%;border-collapse:collapse;font-size:.8rem}
        thead th{background:#1e293b;padding:9px 7px;text-align:center;color:#94a3b8;font-size:.7rem;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #334155;white-space:nowrap}
        tbody tr{border-bottom:1px solid #1e293b}
        tbody tr:nth-child(even){background:rgba(30,41,59,.4)}
        tbody tr:hover{background:rgba(56,189,248,.06)}
        tbody td{padding:8px 7px;text-align:center;white-space:nowrap}
        .td-date{font-weight:600;color:#cbd5e1;text-align:left;padding-left:10px}
        .td-nodata{color:#475569;font-style:italic}
        .suhu-val{font-weight:600}
        .humid-val{color:#60a5fa}

        .legend{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;font-size:.77rem;align-items:center}
        .legend-item{display:flex;align-items:center;gap:5px}

        footer{text-align:center;font-size:.7rem;color:#475569;padding:14px}

        /* ── Signature Editor & Web Preview ── */
        .sig-config-btn{padding:5px 14px;border:1px solid #0284c7;background:rgba(14,165,233,.12);color:#38bdf8;border-radius:6px;cursor:pointer;font-size:.82rem;font-weight:500;transition:all .2s;display:inline-flex;align-items:center;gap:5px}
        .sig-config-btn:hover{background:#0284c7;color:#fff}
        .sig-editor{background:#1e293b;border:1px solid #0284c7;border-radius:10px;padding:16px;margin-bottom:18px}
        .sig-editor-title{font-size:.9rem;font-weight:700;color:#38bdf8;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between}
        .sig-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:12px}
        .sig-card{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px}
        .sig-card h4{font-size:.78rem;color:#cbd5e1;margin-bottom:8px;font-weight:600}
        .sig-field{margin-bottom:8px}
        .sig-field label{display:block;font-size:.7rem;color:#94a3b8;margin-bottom:2px}
        .sig-field input{width:100%;padding:6px 10px;background:#1e293b;border:1px solid #334155;border-radius:5px;color:#f8fafc;font-size:.8rem}
        .sig-field input:focus{outline:none;border-color:#38bdf8}
        .sig-actions{display:flex;gap:10px;justify-content:flex-end;align-items:center;margin-top:10px;flex-wrap:wrap}
        .btn-sec{padding:5px 12px;background:#334155;border:1px solid #475569;color:#e2e8f0;border-radius:6px;cursor:pointer;font-size:.8rem}
        .btn-sec:hover{background:#475569}
        .btn-pri{padding:5px 14px;background:#0ea5e9;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:.8rem}
        .btn-pri:hover{background:#0284c7}

        .web-sig-preview{background:#1e293b;border:1px dashed #334155;border-radius:10px;padding:16px;margin-top:16px}
        .web-sig-preview h3{font-size:.78rem;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;display:flex;justify-content:space-between}

        .print-header, .print-summary-strip, .print-signature{display:none}

        /* ── 1-PAGE EXACT A4 PRINT LAYOUT ── */
        @page {
          size: A4 portrait;
          margin: 6mm 8mm;
        }

        @media print{
          html, body{background:#fff!important;color:#000!important;font-size:8pt!important;height:auto!important;overflow:visible!important}
          .header, .no-print, .status-pill, .tabs, .print-btn, .nav-btn, footer, .chart-box, .alert, .legend, .cards, .sig-editor, .sig-config-btn, .web-sig-preview{display:none!important}
          .content{padding:0!important;max-width:100%!important;margin:0!important}

          /* Kop Surat Ringkas & Bersih (1 Halaman Pas) */
          .print-header{display:block!important;text-align:center;border-bottom:1.5px solid #000;padding-bottom:3px;margin-bottom:4px}
          .print-kop-title{font-size:11pt;font-weight:800;color:#000;letter-spacing:.3px;margin:0}
          .print-kop-sub{font-size:9.5pt;font-weight:700;color:#0f172a;margin:1px 0}
          .print-kop-meta{display:flex!important;justify-content:space-between;font-size:7.2pt;color:#334155;margin-top:2px;font-weight:600}

          /* Strip Ringkasan 1 Baris */
          .print-summary-strip{display:flex!important;justify-content:space-around;background:#f8fafc!important;border:1px solid #94a3b8;border-radius:3px;padding:2.5px 6px;font-size:7.2pt;color:#000;margin-bottom:5px}
          .print-summary-strip span b{color:#0f172a}

          /* Tabel Cetak Sangat Rapi & Ringkas */
          .table-box{background:transparent!important;border:none!important;padding:0!important;margin-bottom:4px!important}
          .table-box h2{display:none!important}
          .table-wrap{overflow:visible!important}
          table{width:100%!important;border-collapse:collapse!important;font-size:7.2pt!important;line-height:1.15!important;page-break-inside:avoid!important}
          thead th{background:#e2e8f0!important;color:#000!important;border:1px solid #475569!important;padding:2px 2px!important;font-weight:700!important;font-size:6.8pt!important}
          tbody td{border:1px solid #94a3b8!important;padding:1.6px 2px!important;color:#000!important;text-align:center!important;font-size:7.1pt!important}
          tbody tr:nth-child(even){background:#f8fafc!important}
          .td-date{font-weight:700!important;color:#000!important;text-align:left!important;padding-left:4px!important}
          .suhu-val{color:#000!important;font-weight:700!important}
          .humid-val{color:#000!important;font-weight:600!important}
          .td-nodata{color:#64748b!important}

          /* Tanda Tangan Cetak */
          .print-signature{display:block!important;margin-top:6px!important;font-size:7.5pt!important;color:#000;page-break-inside:avoid!important}
          .sig-row{display:flex!important;justify-content:space-around!important}
          .signature-box{text-align:center;width:240px}
          .signature-space{height:36px!important}
          .sig-name{font-size:8.2pt!important;font-weight:700!important;color:#000!important;margin-bottom:1px!important}
          .sig-nip{font-size:7.2pt!important;color:#334155!important}
        }
      `}</style>

      {/* Header */}
      <div className="header">
        <div>
          <h1>🌡️ Pemantauan Suhu Server — RS Fatmawati</h1>
          <p>ESP8266 + DHT11 | Monitoring Otomatis 24 Jam | Update tiap 10 detik</p>
        </div>
        <div className="status-pill">
          <div className="dot" style={{ background: dotColor }} />
          <span>{latest.status || 'Menghubungkan...'}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          { key: 'realtime', label: '📡 Real-Time' },
          { key: 'weekly',   label: '📈 Grafik Mingguan' },
          { key: 'monthly',  label: '📋 Laporan Bulanan' },
        ].map(t => (
          <button key={t.key} className={`tab-btn${tab===t.key?' active':''}`} onClick={()=>setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="content">

        {/* ══════════════════════════════════════════════
            TAB 1 — REAL-TIME + GRAFIK HARIAN
        ══════════════════════════════════════════════ */}
        {tab === 'realtime' && (
          <>
            {/* Alert */}
            {latest.suhu !== null && (
              <div className={`alert ${latest.suhu>SUHU_DANGER?'danger':latest.suhu>SUHU_WARNING?'warning':'ok'}`}>
                <span style={{fontSize:'1.2rem'}}>{suhuEmoji(latest.suhu)}</span>
                {latest.suhu > SUHU_DANGER
                  ? `SUHU BERBAHAYA! ${latest.suhu}°C melebihi batas aman (${SUHU_DANGER}°C). Segera periksa pendingin!`
                  : latest.suhu > SUHU_WARNING
                  ? `Suhu mendekati batas aman: ${latest.suhu}°C. Pantau secara berkala.`
                  : `Suhu normal: ${latest.suhu}°C. Semua sistem berjalan baik.`}
              </div>
            )}

            {/* Kartu nilai terkini */}
            <div className="cards">
              <div className="card" style={{borderColor: suhuColor(latest.suhu)}}>
                <div className="lbl">🌡 Suhu Sekarang</div>
                <div className="val" style={{color: suhuColor(latest.suhu)}}>
                  {latest.suhu !== null ? Number(latest.suhu).toFixed(1) : '--'}
                </div>
                <div className="unt">°C</div>
              </div>
              <div className="card">
                <div className="lbl">💧 Kelembaban</div>
                <div className="val" style={{color:'#60a5fa'}}>
                  {latest.humid !== null ? Number(latest.humid).toFixed(1) : '--'}
                </div>
                <div className="unt">%</div>
              </div>
              <div className="card">
                <div className="lbl">🕐 Update Terakhir</div>
                <div className="val" style={{fontSize:'1.2rem',color:'#a78bfa'}}>
                  {latest.timestamp || '--:--:--'}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="legend">
              <div className="legend-item"><span style={{color:'#22c55e'}}>●</span> Normal (≤{SUHU_WARNING}°C)</div>
              <div className="legend-item"><span style={{color:'#f59e0b'}}>●</span> Perhatian ({SUHU_WARNING}–{SUHU_DANGER}°C)</div>
              <div className="legend-item"><span style={{color:'#ef4444'}}>●</span> Bahaya ({'>'}{SUHU_DANGER}°C)</div>
            </div>

            {/* Grafik Harian — Suhu */}
            <div className="chart-box">
              <h2>📈 Grafik Suhu Harian — 60 Data Terakhir</h2>
              <canvas ref={dailySuhuRef} height={110} />
            </div>

            {/* Grafik Harian — Kelembaban */}
            <div className="chart-box">
              <h2>💧 Grafik Kelembaban Harian — 60 Data Terakhir</h2>
              <canvas ref={dailyHumidRef} height={90} />
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════
            TAB 2 — GRAFIK MINGGUAN
        ══════════════════════════════════════════════ */}
        {tab === 'weekly' && (
          <>
            <div className="chart-box">
              <h2>📈 Rata-rata Suhu Per Hari — 7 Hari Terakhir</h2>
              <canvas ref={weekSuhuRef} height={100} />
            </div>
            <div className="chart-box">
              <h2>📊 Rata-rata Kelembaban Per Hari — 7 Hari Terakhir</h2>
              <canvas ref={weekHumidRef} height={90} />
            </div>

            {weekly.length > 0 && (
              <div className="chart-box">
                <h2>📅 Tabel Ringkasan 7 Hari</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Hari</th><th>Avg Suhu</th><th>Avg Humid</th><th>Jumlah Data</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {weekly.map(d => (
                        <tr key={d.tanggal}>
                          <td className="td-date">{d.label}</td>
                          <td className="suhu-val" style={{color:suhuColor(d.avg_suhu)}}>{d.avg_suhu!==null?`${d.avg_suhu}°C`:'-'}</td>
                          <td className="humid-val">{d.avg_humid!==null?`${d.avg_humid}%`:'-'}</td>
                          <td style={{color:'#94a3b8'}}>{d.count} data</td>
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

        {/* ══════════════════════════════════════════════
            TAB 3 — LAPORAN BULANAN
        ══════════════════════════════════════════════ */}
        {tab === 'monthly' && (
          <>
            {/* Header Resmi untuk Cetak / PDF */}
            {/* Header Resmi untuk Cetak / PDF (Kop Ringkas 1 Halaman Pas) */}
            <div className="print-header">
              <h2 className="print-kop-title">RUMAH SAKIT UMUM PUSAT FATMAWATI</h2>
              <h3 className="print-kop-sub">LAPORAN MONITORING SUHU &amp; KELEMBABAN RUANG SERVER</h3>
              <div className="print-kop-meta">
                <span>Instalasi SIMRS / TI</span>
                <span>Periode: {monthly?.nama_bulan || `${BULAN_ID[selMonth-1]} ${selYear}`}</span>
                <span>Jadwal: 🌅 08:00 WIB &amp; 🌙 20:00 WIB</span>
              </div>
            </div>

            {/* Strip Ringkasan 1 Baris Khusus Cetak */}
            {monthly?.data && (
              <div className="print-summary-strip">
                {(() => {
                  const rows = monthly.data.filter(r => r.has_data)
                  const all  = [...rows.map(r=>r.suhu_pagi),...rows.map(r=>r.suhu_malam)].filter(v=>v!==null)
                  const avg  = a => a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):'-'
                  return (
                    <>
                      <span>Periode: <b>{monthly.nama_bulan}</b></span>
                      <span>Hari Tercatat: <b>{rows.length}/{monthly.total_hari} Hari</b></span>
                      <span>Rata-rata Suhu: <b>{avg(all)}°C</b></span>
                      <span>Maks: <b>{all.length?Math.max(...all).toFixed(1):'-'}°C</b></span>
                      <span>Min: <b>{all.length?Math.min(...all).toFixed(1):'-'}°C</b></span>
                    </>
                  )
                })()}
              </div>
            )}

            {/* Navigasi Web (disembunyikan saat cetak) */}
            <div className="month-nav no-print">
              <button className="nav-btn" onClick={prevMonth}>← Prev</button>
              <span className="title">📋 {BULAN_ID[selMonth-1]} {selYear}</span>
              <button className="nav-btn" onClick={nextMonth}
                disabled={selYear===now.getFullYear()&&selMonth>=now.getMonth()+1}>
                Next →
              </button>
              <button className="sig-config-btn" onClick={()=>setShowSigModal(v => !v)}>
                {showSigModal ? '✖ Tutup Pengaturan' : '✍️ Atur Tanda Tangan & NIP'}
              </button>
              <button className="print-btn" onClick={()=>window.print()}>🖨️ Print / PDF</button>
            </div>

            {/* Panel Pengaturan Tanda Tangan & NIP (Bisa diedit & tersimpan) */}
            {showSigModal && (
              <div className="sig-editor no-print">
                <div className="sig-editor-title">
                  <span>✍️ Pengaturan Pejabat Penandatangan &amp; NIP</span>
                  <button className="btn-sec" onClick={()=>setShowSigModal(false)} style={{padding:'2px 8px',fontSize:'.75rem'}}>Tutup</button>
                </div>
                <div className="sig-grid">
                  <div className="sig-card">
                    <h4>Pejabat 1 (Kiri)</h4>
                    <div className="sig-field">
                      <label>Status / Teks:</label>
                      <input value={signatures.pejabat1.status} onChange={e=>updateSig('pejabat1','status',e.target.value)} placeholder="Mengetahui," />
                    </div>
                    <div className="sig-field">
                      <label>Jabatan:</label>
                      <input value={signatures.pejabat1.jabatan} onChange={e=>updateSig('pejabat1','jabatan',e.target.value)} placeholder="Kepala Instalasi SIMRS" />
                    </div>
                    <div className="sig-field">
                      <label>Nama Pejabat:</label>
                      <input value={signatures.pejabat1.nama} onChange={e=>updateSig('pejabat1','nama',e.target.value)} placeholder="dr. Dany Kurniadi Ramdhan, Sp. B.S" />
                    </div>
                    <div className="sig-field">
                      <label>NIP:</label>
                      <input value={signatures.pejabat1.nip} onChange={e=>updateSig('pejabat1','nip',e.target.value)} placeholder="NIP. ..." />
                    </div>
                  </div>

                  <div className="sig-card">
                    <h4>Pejabat 2 (Kanan)</h4>
                    <div className="sig-field">
                      <label>Status / Teks:</label>
                      <input value={signatures.pejabat2.status} onChange={e=>updateSig('pejabat2','status',e.target.value)} placeholder="Mengetahui," />
                    </div>
                    <div className="sig-field">
                      <label>Jabatan:</label>
                      <input value={signatures.pejabat2.jabatan} onChange={e=>updateSig('pejabat2','jabatan',e.target.value)} placeholder="Waka Sub Perangkat & Jaringan TI" />
                    </div>
                    <div className="sig-field">
                      <label>Nama Pejabat:</label>
                      <input value={signatures.pejabat2.nama} onChange={e=>updateSig('pejabat2','nama',e.target.value)} placeholder="Dzakiah Nur Fadhilah, S.Kom" />
                    </div>
                    <div className="sig-field">
                      <label>NIP:</label>
                      <input value={signatures.pejabat2.nip} onChange={e=>updateSig('pejabat2','nip',e.target.value)} placeholder="NIP. ..." />
                    </div>
                  </div>

                  {signatures.showPelaksana && (
                    <>
                      <div className="sig-card">
                        <h4>Pelaksana 1</h4>
                        <div className="sig-field">
                          <label>Jabatan / Label:</label>
                          <input value={signatures.pelaksana1.label} onChange={e=>updateSig('pelaksana1','label',e.target.value)} />
                        </div>
                        <div className="sig-field">
                          <label>Nama:</label>
                          <input value={signatures.pelaksana1.nama} onChange={e=>updateSig('pelaksana1','nama',e.target.value)} />
                        </div>
                        <div className="sig-field">
                          <label>NIP:</label>
                          <input value={signatures.pelaksana1.nip} onChange={e=>updateSig('pelaksana1','nip',e.target.value)} />
                        </div>
                      </div>
                      <div className="sig-card">
                        <h4>Pelaksana 2</h4>
                        <div className="sig-field">
                          <label>Jabatan / Label:</label>
                          <input value={signatures.pelaksana2.label} onChange={e=>updateSig('pelaksana2','label',e.target.value)} />
                        </div>
                        <div className="sig-field">
                          <label>Nama:</label>
                          <input value={signatures.pelaksana2.nama} onChange={e=>updateSig('pelaksana2','nama',e.target.value)} />
                        </div>
                        <div className="sig-field">
                          <label>NIP:</label>
                          <input value={signatures.pelaksana2.nip} onChange={e=>updateSig('pelaksana2','nip',e.target.value)} />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="sig-actions">
                  <label style={{display:'flex',alignItems:'center',gap:6,fontSize:'.78rem',color:'#cbd5e1',cursor:'pointer',marginRight:'auto'}}>
                    <input type="checkbox" checked={signatures.showPelaksana} onChange={e=>updateSig('showPelaksana',null,e.target.checked)} />
                    Tampilkan baris pelaksana teknis (4 tanda tangan)
                  </label>
                  <button className="btn-sec" onClick={resetSignatures}>Reset Default</button>
                  <button className="btn-pri" onClick={()=>setShowSigModal(false)}>✓ Simpan &amp; Terapkan</button>
                </div>
              </div>
            )}

            {loadingM ? (
              <div style={{textAlign:'center',padding:'40px',color:'#94a3b8'}}>⏳ Memuat laporan...</div>
            ) : monthly ? (
              <>
                {/* Grafik Bulanan (hanya tampil di Web, disembunyikan saat cetak) */}
                <div className="chart-box no-print">
                  <h2>📈 Grafik Suhu Bulanan — Pagi &amp; Malam</h2>
                  <canvas ref={monthSuhuRef} height={100} />
                </div>

                <div className="chart-box no-print">
                  <h2>💧 Grafik Kelembaban Bulanan — Pagi &amp; Malam</h2>
                  <canvas ref={monthHumidRef} height={90} />
                </div>

                {/* Legend + info di web */}
                <div className="legend no-print">
                  <div className="legend-item"><span style={{color:'#22c55e'}}>✅</span> Normal (≤{SUHU_WARNING}°C)</div>
                  <div className="legend-item"><span style={{color:'#f59e0b'}}>⚠️</span> Perhatian ({SUHU_WARNING}–{SUHU_DANGER}°C)</div>
                  <div className="legend-item"><span style={{color:'#ef4444'}}>🔴</span> Bahaya ({'>'}{SUHU_DANGER}°C)</div>
                  <div className="legend-item" style={{marginLeft:'auto',color:'#94a3b8',fontSize:'.73rem'}}>
                    Pagi ≈ 08:00 WIB | Malam ≈ 20:00 WIB
                  </div>
                </div>

                {/* Kartu statistik ringkasan */}
                {(() => {
                  const rows = monthly.data.filter(r => r.has_data)
                  const all  = [...rows.map(r=>r.suhu_pagi),...rows.map(r=>r.suhu_malam)].filter(v=>v!==null)
                  const avg  = a => a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):'-'
                  return (
                    <div className="cards" style={{marginBottom:'16px'}}>
                      <div className="card"><div className="lbl">📊 Rata-rata Suhu</div><div className="val" style={{color:suhuColor(parseFloat(avg(all))),fontSize:'1.6rem'}}>{avg(all)}°C</div></div>
                      <div className="card"><div className="lbl">🔺 Suhu Tertinggi</div><div className="val" style={{color:'#ef4444',fontSize:'1.6rem'}}>{all.length?Math.max(...all).toFixed(1):'-'}°C</div></div>
                      <div className="card"><div className="lbl">🔻 Suhu Terendah</div><div className="val" style={{color:'#22c55e',fontSize:'1.6rem'}}>{all.length?Math.min(...all).toFixed(1):'-'}°C</div></div>
                      <div className="card"><div className="lbl">📅 Hari Tercatat</div><div className="val" style={{color:'#a78bfa',fontSize:'1.6rem'}}>{rows.length}</div><div className="unt">dari {monthly.total_hari} hari</div></div>
                    </div>
                  )
                })()}

                {/* Tabel Data Harian */}
                <div className="table-box">
                  <h2 className="no-print">📋 Tabel Pencatatan Suhu &amp; Kelembaban Harian</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{textAlign:'left',paddingLeft:'8px'}}>Tanggal</th>
                          <th colSpan={4} style={{borderBottom:'1px solid #475569',color:'#fbbf24'}}>🌅 Pagi (08:00 WIB)</th>
                          <th colSpan={4} style={{borderBottom:'1px solid #475569',color:'#818cf8'}}>🌙 Malam (20:00 WIB)</th>
                        </tr>
                        <tr>
                          <th>Waktu</th><th>Suhu</th><th>Humid</th><th>Status</th>
                          <th>Waktu</th><th>Suhu</th><th>Humid</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthly.data.map(row => {
                          const isToday = row.tanggal === new Date().toISOString().slice(0,10)
                          return (
                            <tr key={row.tanggal} style={isToday?{background:'rgba(56,189,248,.08)'}:{}}>
                              <td className="td-date">
                                {row.hari} {BULAN_ID[selMonth-1].slice(0,3)}
                                {isToday && <span className="no-print" style={{color:'#38bdf8',marginLeft:4,fontSize:'.7rem'}}>●</span>}
                              </td>
                              {row.has_data ? (
                                <>
                                  <td style={{color:'#fbbf24',fontSize:'.78rem'}}>{row.waktu_pagi}</td>
                                  <td className="suhu-val" style={{color:suhuColor(row.suhu_pagi)}}>{row.suhu_pagi!==null?`${row.suhu_pagi}°C`:'-'}</td>
                                  <td className="humid-val">{row.humid_pagi!==null?`${row.humid_pagi}%`:'-'}</td>
                                  <td>{row.status_pagi}</td>
                                  <td style={{color:'#818cf8',fontSize:'.78rem'}}>{row.waktu_malam}</td>
                                  <td className="suhu-val" style={{color:suhuColor(row.suhu_malam)}}>{row.suhu_malam!==null?`${row.suhu_malam}°C`:'-'}</td>
                                  <td className="humid-val">{row.humid_malam!==null?`${row.humid_malam}%`:'-'}</td>
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
                </div>

                {/* Bagian Tanda Tangan Cetak (1 Halaman Pas) */}
                <div className="print-signature">
                  {signatures.showPelaksana && (
                    <div className="sig-row" style={{marginBottom:'10px'}}>
                      <div className="signature-box">
                        <p>{signatures.pelaksana1.label},</p>
                        <div className="signature-space"></div>
                        <p className="sig-name"><u><b>{signatures.pelaksana1.nama}</b></u></p>
                        <p className="sig-nip">{signatures.pelaksana1.nip}</p>
                      </div>
                      <div className="signature-box">
                        <p>{signatures.pelaksana2.label},</p>
                        <div className="signature-space"></div>
                        <p className="sig-name"><u><b>{signatures.pelaksana2.nama}</b></u></p>
                        <p className="sig-nip">{signatures.pelaksana2.nip}</p>
                      </div>
                    </div>
                  )}
                  <div className="sig-row">
                    <div className="signature-box">
                      <p>{signatures.pejabat1.status}</p>
                      <p><b>{signatures.pejabat1.jabatan}</b></p>
                      <div className="signature-space"></div>
                      <p className="sig-name"><u><b>{signatures.pejabat1.nama}</b></u></p>
                      <p className="sig-nip">{signatures.pejabat1.nip}</p>
                    </div>
                    <div className="signature-box">
                      <p>{signatures.pejabat2.status}</p>
                      <p><b>{signatures.pejabat2.jabatan}</b></p>
                      <div className="signature-space"></div>
                      <p className="sig-name"><u><b>{signatures.pejabat2.nama}</b></u></p>
                      <p className="sig-nip">{signatures.pejabat2.nip}</p>
                    </div>
                  </div>
                </div>

                {/* Preview Tanda Tangan di Tampilan Web */}
                <div className="web-sig-preview no-print">
                  <h3>
                    <span>Pengesahan &amp; Tanda Tangan Laporan</span>
                    <button className="sig-config-btn" onClick={()=>setShowSigModal(true)} style={{fontSize:'.75rem',padding:'2px 8px'}}>
                      ✏️ Edit Tanda Tangan &amp; NIP
                    </button>
                  </h3>
                  <div style={{display:'flex',justifyContent:'space-around',flexWrap:'wrap',gap:20,textAlign:'center',paddingTop:10}}>
                    <div>
                      <p style={{fontSize:'.78rem',color:'#94a3b8'}}>{signatures.pejabat1.status}</p>
                      <p style={{fontSize:'.82rem',fontWeight:600,color:'#f8fafc'}}>{signatures.pejabat1.jabatan}</p>
                      <div style={{height:50,borderBottom:'1px dashed #475569',margin:'10px auto 6px',width:220}}></div>
                      <p style={{fontSize:'.85rem',fontWeight:700,color:'#38bdf8'}}>{signatures.pejabat1.nama}</p>
                      <p style={{fontSize:'.75rem',color:'#94a3b8'}}>{signatures.pejabat1.nip}</p>
                    </div>
                    <div>
                      <p style={{fontSize:'.78rem',color:'#94a3b8'}}>{signatures.pejabat2.status}</p>
                      <p style={{fontSize:'.82rem',fontWeight:600,color:'#f8fafc'}}>{signatures.pejabat2.jabatan}</p>
                      <div style={{height:50,borderBottom:'1px dashed #475569',margin:'10px auto 6px',width:220}}></div>
                      <p style={{fontSize:'.85rem',fontWeight:700,color:'#38bdf8'}}>{signatures.pejabat2.nama}</p>
                      <p style={{fontSize:'.75rem',color:'#94a3b8'}}>{signatures.pejabat2.nip}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{textAlign:'center',padding:'40px',color:'#94a3b8'}}>Gagal memuat laporan.</div>
            )}
          </>
        )}
      </div>

      <footer>RS Fatmawati | Server Room Monitoring | ESP8266 + DHT11 → Vercel + Supabase</footer>
    </>
  )
}
