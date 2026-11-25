// Shared state and helpers for both game modes. Loaded first; exposes window.App.
;(() => {
  'use strict'

  const MIN_PLAYERS = 3
  const MAX_PLAYERS = 20
  const STORE_KEY = 'impostor-game-v1'

  const $ = (sel) => document.querySelector(sel)
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const state = {
    mode: 'word',
    players: ['', '', '', ''],
    sound: true,
    // Word Impostor settings
    impostors: 1,
    category: 'random',
    // Mafia settings
    mafiaCount: 1,
    doctor: true,
    detective: true,
    jester: false,
    // Current round
    names: [],
    roles: [],
    turn: 0
  }

  function rand(n) {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0] % n
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rand(i + 1)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
  }

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id))
    window.scrollTo(0, 0)
  }

  const SAVED_KEYS = ['mode', 'players', 'sound', 'impostors', 'category', 'mafiaCount', 'doctor', 'detective', 'jester']

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY))
      if (!s) return
      if (s.mode === 'word' || s.mode === 'mafia') state.mode = s.mode
      if (Array.isArray(s.players) && s.players.length >= MIN_PLAYERS) state.players = s.players.slice(0, MAX_PLAYERS)
      if (Number.isInteger(s.impostors)) state.impostors = s.impostors
      if (Number.isInteger(s.mafiaCount)) state.mafiaCount = s.mafiaCount
      if (s.category === 'random' || (window.CATEGORIES && window.CATEGORIES[s.category])) state.category = s.category
      ;['sound', 'doctor', 'detective', 'jester'].forEach((k) => {
        if (typeof s[k] === 'boolean') state[k] = s[k]
      })
    } catch { /* storage blocked, use defaults */ }
  }

  function save() {
    try {
      const out = {}
      SAVED_KEYS.forEach((k) => { out[k] = state[k] })
      localStorage.setItem(STORE_KEY, JSON.stringify(out))
    } catch { /* ignore */ }
  }

  // ---------- Sound ----------
  // Sounds are the same for every role so nobody can tell by ear.
  let ctx
  function audio() {
    if (!state.sound) return null
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') ctx.resume()
      return ctx
    } catch { return null }
  }

  function beep(freq, len, vol, type) {
    const a = audio()
    if (!a) return
    const o = a.createOscillator()
    const g = a.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(vol, a.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + len)
    o.connect(g).connect(a.destination)
    o.start()
    o.stop(a.currentTime + len + 0.02)
  }

  const tick = () => beep(1500, 0.035, 0.06, 'triangle')
  const thud = () => { beep(140, 0.35, 0.25, 'sine'); beep(70, 0.5, 0.2, 'sine') }

  // Reads narration aloud so players with their eyes shut know what's happening
  function speak(text) {
    if (!state.sound || !window.speechSynthesis) return
    try {
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.92
      u.pitch = 0.85
      speechSynthesis.speak(u)
    } catch { /* speech not available */ }
  }

  window.App = {
    MIN_PLAYERS, MAX_PLAYERS, state, $, el, rand, shuffle, sleep, show, load, save,
    audio, tick, thud, speak
  }
})()
