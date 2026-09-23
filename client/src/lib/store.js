import { create } from 'zustand'
import { api, setToken } from './api.js'

export const useAuth = create((set) => ({
  user: null,
  loading: true,

  // The watchlist lives beside the user rather than inside either page that uses it.
  // Two pages read it — the analyzer, to decide whether its control says add or
  // remove, and the dashboard, to draw the list — and two independent copies is how
  // those two start disagreeing about what is on it.
  //
  // null means not fetched yet. An empty array means fetched and genuinely empty, and
  // the two render as different things.
  watchlist: null,
  watchlistCap: null,

  async loadWatchlist() {
    const { watchlist, cap } = await api('/analyze/watchlist')
    set({ watchlist, watchlistCap: cap })
  },

  // Every watchlist endpoint answers with the whole list, so none of these three has
  // to reconstruct it locally and none of them can drift from what was stored.
  async addToWatchlist(isin) {
    const { watchlist, cap } = await api('/analyze/watchlist', { method: 'POST', body: { isin } })
    set({ watchlist, watchlistCap: cap })
  },

  async removeFromWatchlist(isin) {
    const { watchlist, cap } = await api(`/analyze/watchlist/${encodeURIComponent(isin)}`, { method: 'DELETE' })
    set({ watchlist, watchlistCap: cap })
  },

  async bootstrap() {
    try {
      const { user } = await api('/auth/me')
      set({ user, loading: false })
    } catch {
      setToken(null)
      set({ user: null, loading: false, watchlist: null, watchlistCap: null })
    }
  },

  // Signup is two steps: the details are held server side until the emailed code
  // is confirmed, so an unverified address never creates an account.
  async signupStart(payload) {
    return api('/auth/signup/start', { method: 'POST', body: payload, auth: false })
  },

  async signupVerify(payload) {
    const { token, user } = await api('/auth/signup/verify', { method: 'POST', body: payload, auth: false })
    setToken(token)
    set({ user, watchlist: null, watchlistCap: null })
  },

  async resendSignupCode(email) {
    return api('/auth/signup/resend', { method: 'POST', body: { email }, auth: false })
  },

  async forgot(email) {
    return api('/auth/forgot', { method: 'POST', body: { email }, auth: false })
  },

  async resetPassword(payload) {
    const { token, user } = await api('/auth/reset', { method: 'POST', body: payload, auth: false })
    setToken(token)
    set({ user, watchlist: null, watchlistCap: null })
  },

  async login(payload) {
    const { token, user } = await api('/auth/login', { method: 'POST', body: payload, auth: false })
    setToken(token)
    set({ user, watchlist: null, watchlistCap: null })
  },

  logout() {
    setToken(null)
    // The list is cleared with the session, not left in memory for whoever signs in
    // on this browser next.
    set({ user: null, watchlist: null, watchlistCap: null })
  },

  setUser: (user) => set({ user }),
}))

// XP curve: each rank costs a bit more than the last.
export const RANKS = [
  { name: 'Chai Trader', min: 0 },
  { name: 'Watchlist Warrior', min: 250 },
  { name: 'Chart Reader', min: 600 },
  { name: 'Balance Sheet Nerd', min: 1100 },
  { name: 'Portfolio Builder', min: 1800 },
  { name: 'Market Master', min: 2800 },
  { name: 'Dalal Street Veteran', min: 3600 },
]

export function rankFor(xp = 0) {
  const index = RANKS.reduce((acc, r, i) => (xp >= r.min ? i : acc), 0)
  const current = RANKS[index]
  const next = RANKS[index + 1]
  const progress = next ? (xp - current.min) / (next.min - current.min) : 1
  return { current, next, progress: Math.min(1, Math.max(0, progress)) }
}

export const BADGE_META = {
  'first-step': { label: 'First Step', emoji: '🌱', note: 'Created your account.' },
  'perfect-score': { label: 'Flawless', emoji: '💯', note: 'Scored 100% on a quiz.' },
  'week-warrior': { label: 'Week Warrior', emoji: '🔥', note: 'Seven day learning streak.' },
  'thousand-club': { label: '1K Club', emoji: '⚡', note: 'Crossed 1,000 XP.' },
  'fundamental-graduate': { label: 'Fundamental Grad', emoji: '📊', note: 'Cleared every fundamental level.' },
  'technical-graduate': { label: 'Technical Grad', emoji: '📈', note: 'Cleared every technical level.' },
  'market-master': { label: 'Market Master', emoji: '👑', note: 'Cleared every level on both tracks.' },
}
