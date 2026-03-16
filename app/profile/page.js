'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import './profile.css'

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [stats, setStats] = useState(null)
  const [usernameForm, setUsernameForm] = useState({ newUsername: '', password: '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' })
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteStep, setDeleteStep] = useState(false)

  const [msg, setMsg] = useState({})
  const [loading, setLoading] = useState({})

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/user/stats')
      .then(r => r.json())
      .then(setStats)
  }, [status])

  if (status === 'loading' || (status === 'authenticated' && !stats)) return null

  if (!session?.user) {
    return (
      <div className="profile-page">
        <div className="profile-container">
          <p className="profile-not-auth">You must be signed in to view your profile.</p>
          <Link href="/" className="profile-back-btn">← Back to Game</Link>
        </div>
      </div>
    )
  }

  const { username, bankroll, hands, wins, pushes, resets, totalIncome, blackjacks, trainingHands, trainingCorrect } = stats
  const winRate = hands > 0 ? Math.round((wins / hands) * 100) : 0
  const trainingAccuracy = trainingHands > 0 ? Math.round((trainingCorrect / trainingHands) * 100) : null
  const incomeDisplay = (totalIncome >= 0 ? '+' : '') + '$' + totalIncome

  async function call(key, path, body) {
    setLoading(l => ({ ...l, [key]: true }))
    setMsg(m => ({ ...m, [key]: null }))
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg(m => ({ ...m, [key]: { error: data.error } }))
      } else {
        setMsg(m => ({ ...m, [key]: { success: true } }))
      }
      return res.ok
    } catch {
      setMsg(m => ({ ...m, [key]: { error: 'Something went wrong' } }))
      return false
    } finally {
      setLoading(l => ({ ...l, [key]: false }))
    }
  }

  async function handleReset() {
    const ok = await call('reset', '/api/user/reset', {})
    if (ok) {
      router.push('/')
    }
  }

  async function handleChangeUsername(e) {
    e.preventDefault()
    const ok = await call('username', '/api/user/change-username', usernameForm)
    if (ok) {
      await signOut({ callbackUrl: '/' })
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    const ok = await call('password', '/api/user/change-password', passwordForm)
    if (ok) {
      await signOut({ callbackUrl: '/' })
    }
  }

  async function handleDelete(e) {
    e.preventDefault()
    const ok = await call('delete', '/api/user/delete-account', { password: deletePassword })
    if (ok) {
      await signOut({ callbackUrl: '/' })
    }
  }

  return (
    <div className="profile-page">
      <div className="profile-container">

        <div className="profile-header">
          <Link href="/" className="profile-back-btn">← Back to Game</Link>
          <h1 className="profile-username">{username}</h1>
        </div>

        {/* Stats */}
        <section className="profile-section">
          <h2 className="profile-section-title">Stats</h2>
          <div className="profile-stats-grid">
            <div className="profile-stat">
              <span className="profile-stat-label">Bankroll</span>
              <span className="profile-stat-value">${bankroll}</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">Hands</span>
              <span className="profile-stat-value">{hands}</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">Win Rate</span>
              <span className="profile-stat-value">{winRate}%</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">Total Income</span>
              <span className={`profile-stat-value${totalIncome > 0 ? ' profile-stat-positive' : totalIncome < 0 ? ' profile-stat-negative' : ''}`}>
                {incomeDisplay}
              </span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">Blackjacks</span>
              <span className="profile-stat-value">{blackjacks ?? 0}</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">Pushes</span>
              <span className="profile-stat-value">{pushes}</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">Training Hands</span>
              <span className="profile-stat-value">{trainingHands ?? 0}</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">Strategy Accuracy</span>
              <span className="profile-stat-value">
                {trainingAccuracy !== null ? `${trainingAccuracy}%` : '—'}
              </span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">Resets</span>
              <span className="profile-stat-value">{resets ?? 0}</span>
            </div>
          </div>
          <button
            className="profile-btn profile-btn-reset"
            onClick={handleReset}
            disabled={loading.reset}
          >
            {loading.reset ? 'Resetting…' : 'Reset Game'}
          </button>
          {msg.reset?.success && <p className="profile-msg-ok">Game reset — redirecting…</p>}
          {msg.reset?.error && <p className="profile-msg-err">{msg.reset.error}</p>}
        </section>

        {/* Change Username */}
        <section className="profile-section">
          <h2 className="profile-section-title">Change Username</h2>
          <form className="profile-form" onSubmit={handleChangeUsername}>
            <input
              className="profile-input"
              type="text"
              placeholder="New username"
              value={usernameForm.newUsername}
              onChange={e => setUsernameForm(f => ({ ...f, newUsername: e.target.value }))}
              maxLength={20}
              required
            />
            <input
              className="profile-input"
              type="password"
              placeholder="Current password"
              value={usernameForm.password}
              onChange={e => setUsernameForm(f => ({ ...f, password: e.target.value }))}
              required
            />
            <button className="profile-btn" type="submit" disabled={loading.username}>
              {loading.username ? 'Updating…' : 'Update Username'}
            </button>
            {msg.username?.success && <p className="profile-msg-ok">Updated — please sign in again.</p>}
            {msg.username?.error && <p className="profile-msg-err">{msg.username.error}</p>}
          </form>
        </section>

        {/* Change Password */}
        <section className="profile-section">
          <h2 className="profile-section-title">Change Password</h2>
          <form className="profile-form" onSubmit={handleChangePassword}>
            <input
              className="profile-input"
              type="password"
              placeholder="Current password"
              value={passwordForm.currentPassword}
              onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
              required
            />
            <input
              className="profile-input"
              type="password"
              placeholder="New password (min 6 characters)"
              value={passwordForm.newPassword}
              onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
              required
            />
            <button className="profile-btn" type="submit" disabled={loading.password}>
              {loading.password ? 'Updating…' : 'Update Password'}
            </button>
            {msg.password?.success && <p className="profile-msg-ok">Updated — please sign in again.</p>}
            {msg.password?.error && <p className="profile-msg-err">{msg.password.error}</p>}
          </form>
        </section>

        {/* Delete Account */}
        <section className="profile-section profile-section-danger">
          <h2 className="profile-section-title">Delete Account</h2>
          {!deleteStep ? (
            <button className="profile-btn profile-btn-danger" onClick={() => setDeleteStep(true)}>
              Delete Account
            </button>
          ) : (
            <form className="profile-form" onSubmit={handleDelete}>
              <p className="profile-danger-warning">This is permanent and cannot be undone.</p>
              <input
                className="profile-input"
                type="password"
                placeholder="Enter password to confirm"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                required
              />
              <div className="profile-danger-actions">
                <button className="profile-btn profile-btn-danger" type="submit" disabled={loading.delete}>
                  {loading.delete ? 'Deleting…' : 'Confirm Delete'}
                </button>
                <button
                  className="profile-btn profile-btn-cancel"
                  type="button"
                  onClick={() => { setDeleteStep(false); setDeletePassword('') }}
                >
                  Cancel
                </button>
              </div>
              {msg.delete?.error && <p className="profile-msg-err">{msg.delete.error}</p>}
            </form>
          )}
        </section>

      </div>
    </div>
  )
}
