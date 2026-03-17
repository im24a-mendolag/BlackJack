'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { DeckProvider } from './context/DeckContext'
import App from './App'
import AuthModal from './components/AuthModal'
import MultiplayerClient from './multiplayer/MultiplayerClient'

export default function GameClient() {
  const { data: session, status } = useSession()
  const [mode, setMode] = useState('singleplayer') // 'singleplayer' | 'multiplayer'
  const [guestMode, setGuestMode] = useState(false)
  const [modalDismissed, setModalDismissed] = useState(false)
  const [volumeOn, setVolumeOn] = useState(true)
  const [userId, setUserId] = useState(session?.user?.id ?? null)
  const [dbStats, setDbStats] = useState(undefined)
  const saveTimer = useRef(null)
  const pendingSave = useRef(null)
  const prevUserIdRef = useRef(session?.user?.id)

  // Load initial volume
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('volume')
      if (stored !== null) {
        setVolumeOn(stored === 'true')
      }
    }
  }, [])

  // Update userId for stable key
  useEffect(() => {
    setUserId(session?.user?.id ?? null)
  }, [session?.user?.id])

  // Fetch fresh stats from DB on authentication to avoid stale JWT values
  useEffect(() => {
    if (status !== 'authenticated') {
      setDbStats(undefined)
      return
    }
    fetch('/api/user/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => setDbStats(data ?? null))
      .catch(() => setDbStats(null))
  }, [status, session?.user?.id])

  // Detect logout → reset modal state
  useEffect(() => {
    const wasLoggedIn = prevUserIdRef.current
    const isNowLoggedOut = !session?.user?.id
    if (wasLoggedIn && isNowLoggedOut) {
      setGuestMode(false)
      setModalDismissed(false)
    }
    prevUserIdRef.current = session?.user?.id
  }, [session])

  const handleRoundEnd = useCallback(({ bankroll, stats, trainingStats }) => {
    if (!session?.user?.id) return
    pendingSave.current = { bankroll, ...stats, ...trainingStats }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const data = pendingSave.current
      if (!data) return
      try {
        await fetch('/api/game/save-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      } catch (e) { console.error('Save failed:', e) }
    }, 800)
  }, [session])

  const handleReset = useCallback(async () => {
    if (!session?.user?.id) return
    try {
      await fetch('/api/user/reset', { method: 'POST' })
    } catch (e) { console.error('Reset failed:', e) }
  }, [session])

  const openAuthModal = useCallback(() => {
    setGuestMode(false)
    setModalDismissed(false)
  }, [])

  const handleVolumeChange = useCallback((newVolume) => {
    setVolumeOn(newVolume)
    if (typeof window !== 'undefined') {
      localStorage.setItem('volume', newVolume.toString())
    }
  }, [])

  // Multiplayer mode — completely isolated from singleplayer state
  if (mode === 'multiplayer') {
    return (
      <MultiplayerClient
        onLeave={() => setMode('singleplayer')}
        volumeOn={volumeOn}
      />
    )
  }

  // Wait for session and DB stats before rendering singleplayer game
  if (status === 'loading') return null
  if (status === 'authenticated' && dbStats === undefined) return null

  const showModal = status === 'unauthenticated' && !guestMode && !modalDismissed
  const initialBankroll = dbStats?.bankroll ?? 1000
  const initialStats = dbStats
    ? { hands: dbStats.hands, wins: dbStats.wins, losses: dbStats.losses, pushes: dbStats.pushes, totalIncome: dbStats.totalIncome ?? 0, blackjacks: dbStats.blackjacks ?? 0, trainingHands: dbStats.trainingHands ?? 0, trainingCorrect: dbStats.trainingCorrect ?? 0 }
    : { hands: 0, wins: 0, losses: 0, pushes: 0, totalIncome: 0, blackjacks: 0, trainingHands: 0, trainingCorrect: 0 }

  return (
    <>
      {showModal && (
        <AuthModal onClose={() => setModalDismissed(true)} onGuest={() => setGuestMode(true)} />
      )}
      <DeckProvider key={userId ?? 'guest'} initialBankroll={initialBankroll}>
        <App
          initialStats={initialStats}
          onRoundEnd={handleRoundEnd}
          onReset={handleReset}
          onShowAuth={openAuthModal}
          volumeOn={volumeOn}
          onVolumeChange={handleVolumeChange}
          onSwitchToMultiplayer={() => setMode('multiplayer')}
        />
      </DeckProvider>
    </>
  )
}
