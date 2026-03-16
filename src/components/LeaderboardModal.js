'use client'
import { useEffect, useState } from 'react'
import './LeaderboardModal.css'

const BOARDS = [
  { key: 'income',   label: 'Income' },
  { key: 'training', label: 'Training' },
  { key: 'resets',   label: 'Resets' },
]

function rankClass(i) {
  if (i === 0) return 'lb-rank lb-rank-1'
  if (i === 1) return 'lb-rank lb-rank-2'
  if (i === 2) return 'lb-rank lb-rank-3'
  return 'lb-rank'
}

function IncomeRow({ entry, i }) {
  const sign = entry.totalIncome >= 0 ? '+' : ''
  return (
    <div className="lb-row">
      <span className={rankClass(i)}>{i + 1}</span>
      <span className="lb-name">{entry.username}</span>
      <span className="lb-primary" data-positive={entry.totalIncome >= 0}>
        {sign}${entry.totalIncome}
      </span>
      <span className="lb-secondary">{entry.hands} hands</span>
    </div>
  )
}

function TrainingRow({ entry, i }) {
  const accuracy = entry.trainingHands > 0
    ? Math.round((entry.trainingCorrect / entry.trainingHands) * 100)
    : 0
  return (
    <div className="lb-row">
      <span className={rankClass(i)}>{i + 1}</span>
      <span className="lb-name">{entry.username}</span>
      <span className="lb-primary">{entry.trainingHands} hands</span>
      <span className="lb-secondary">{accuracy}% correct</span>
    </div>
  )
}

function ResetsRow({ entry, i }) {
  return (
    <div className="lb-row">
      <span className={rankClass(i)}>{i + 1}</span>
      <span className="lb-name">{entry.username}</span>
      <span className="lb-primary">{entry.resets} resets</span>
    </div>
  )
}

export default function LeaderboardModal({ onClose }) {
  const [active, setActive] = useState('income')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const rows = data?.[active] ?? []

  return (
    <div className="lb-overlay" onClick={onClose}>
      <div className="lb-modal" onClick={e => e.stopPropagation()}>
        <div className="lb-header">
          <span className="lb-title">Leaderboard</span>
          <button className="lb-close" onClick={onClose}>✕</button>
        </div>

        <div className="lb-tabs">
          {BOARDS.map(b => (
            <button
              key={b.key}
              className={`lb-tab${active === b.key ? ' lb-tab-active' : ''}`}
              onClick={() => setActive(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="lb-list">
          {loading && <div className="lb-empty">Loading…</div>}
          {!loading && rows.length === 0 && (
            <div className="lb-empty">No entries yet.</div>
          )}
          {!loading && rows.map((entry, i) => (
            active === 'income'   ? <IncomeRow   key={entry.username} entry={entry} i={i} /> :
            active === 'training' ? <TrainingRow key={entry.username} entry={entry} i={i} /> :
                                    <ResetsRow   key={entry.username} entry={entry} i={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
