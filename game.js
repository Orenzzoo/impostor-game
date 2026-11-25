;(() => {
  'use strict'

  const $ = (sel) => document.querySelector(sel)
  const MIN_PLAYERS = 3
  const MAX_PLAYERS = 20
  const SEGMENTS = 12
  const STORE_KEY = 'impostor-game-v1'
  const CATEGORIES = window.CATEGORIES

  const state = {
    players: ['', '', '', ''],
    impostors: 1,
    category: 'random',
    hint: true,
    sound: true,
    // Per-round
    names: [],
    impostorSet: new Set(),
    word: '',
    wordCategory: '',
    turn: 0,
    starter: 0,
    used: {},
    rotation: 0,
    spinning: false
  }

  // ---------- Helpers ----------
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

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY))
      if (!s) return
      if (Array.isArray(s.players) && s.players.length >= MIN_PLAYERS) state.players = s.players.slice(0, MAX_PLAYERS)
      if (Number.isInteger(s.impostors)) state.impostors = s.impostors
      if (s.category === 'random' || CATEGORIES[s.category]) state.category = s.category
      if (typeof s.hint === 'boolean') state.hint = s.hint
      if (typeof s.sound === 'boolean') state.sound = s.sound
    } catch { /* storage blocked, use defaults */ }
  }

  function save() {
    try {
      const { players, impostors, category, hint, sound } = state
      localStorage.setItem(STORE_KEY, JSON.stringify({ players, impostors, category, hint, sound }))
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

  function renderSound() {
    $('#soundBtn').classList.toggle('muted', !state.sound)
  }

  // ---------- Setup ----------
  function maxImpostors() {
    return Math.max(1, Math.floor((state.players.length - 1) / 2))
  }

  function renderPlayers() {
    const list = $('#playerList')
    list.innerHTML = ''
    state.players.forEach((name, i) => {
      const row = el('div', 'player-row')
      row.append(el('span', 'player-num', i + 1))

      const input = el('input')
      input.type = 'text'
      input.maxLength = 20
      input.placeholder = `Player ${i + 1}`
      input.value = name
      input.autocomplete = 'off'
      input.addEventListener('input', () => { state.players[i] = input.value; save() })
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        const next = list.querySelectorAll('input')[i + 1]
        if (next) next.focus()
        else if (state.players.length < MAX_PLAYERS) addPlayer()
      })
      row.append(input)

      const del = el('button', 'del-btn')
      del.setAttribute('aria-label', `Remove player ${i + 1}`)
      del.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
      del.disabled = state.players.length <= MIN_PLAYERS
      del.addEventListener('click', () => {
        state.players.splice(i, 1)
        save()
        renderPlayers()
      })
      row.append(del)
      list.append(row)
    })
    $('#playerCount').textContent = state.players.length
    $('#addPlayer').disabled = state.players.length >= MAX_PLAYERS
    renderImpostors()
  }

  function addPlayer() {
    state.players.push('')
    save()
    renderPlayers()
    const inputs = $('#playerList').querySelectorAll('input')
    inputs[inputs.length - 1].focus()
  }

  function renderImpostors() {
    const max = maxImpostors()
    state.impostors = Math.min(Math.max(1, state.impostors), max)
    $('#impCount').textContent = state.impostors
    $('#impMax').textContent = max
    $('#impMinus').disabled = state.impostors <= 1
    $('#impPlus').disabled = state.impostors >= max
    save()
  }

  function renderOptions() {
    const sel = $('#categorySelect')
    sel.innerHTML = ''
    sel.append(new Option('Random', 'random'))
    Object.keys(CATEGORIES).forEach((c) => sel.append(new Option(c, c)))
    sel.value = state.category
    $('#hintToggle').checked = state.hint
  }

  // ---------- Player count ----------
  // Asked first on every load; saved names are kept and trimmed or padded to fit.
  let pickedCount = 4

  function renderCount() {
    const num = $('#countNum')
    num.textContent = pickedCount
    num.classList.remove('bump')
    void num.offsetWidth
    num.classList.add('bump')
    $('#countMinus').disabled = pickedCount <= MIN_PLAYERS
    $('#countPlus').disabled = pickedCount >= MAX_PLAYERS
    $('#countChips').querySelectorAll('button').forEach((b) =>
      b.classList.toggle('on', Number(b.dataset.n) === pickedCount))
  }

  function setCount(n) {
    pickedCount = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, n))
    renderCount()
  }

  function buildCountChips() {
    const chips = $('#countChips')
    for (let n = 3; n <= 12; n++) {
      const b = el('button', '', n)
      b.dataset.n = n
      b.addEventListener('click', () => setCount(n))
      chips.append(b)
    }
  }

  function confirmCount() {
    const p = state.players
    if (p.length > pickedCount) p.length = pickedCount
    while (p.length < pickedCount) p.push('')
    save()
    renderPlayers()
    show('setup')
  }

  // ---------- Round ----------
  function pickWord() {
    const keys = Object.keys(CATEGORIES)
    const category = state.category === 'random' ? keys[rand(keys.length)] : state.category
    const used = state.used[category] || (state.used[category] = [])
    let pool = CATEGORIES[category].filter((w) => !used.includes(w))
    if (!pool.length) {
      used.length = 0
      pool = CATEGORIES[category].slice()
    }
    const word = pool[rand(pool.length)]
    used.push(word)
    return { category, word }
  }

  function startRound() {
    const n = state.players.length
    state.names = state.players.map((p, i) => p.trim() || `Player ${i + 1}`)
    // Roles are dealt up front so the impostor count is always exact.
    // The wheel is only for show; it never decides anything.
    const order = shuffle([...Array(n).keys()])
    state.impostorSet = new Set(order.slice(0, state.impostors))
    const { category, word } = pickWord()
    state.word = word
    state.wordCategory = category
    state.starter = rand(n)
    state.turn = 0
    showTurn()
  }

  function quitRound() {
    if (confirm('End this round? Roles will be dealt again next time.')) show('setup')
  }

  // ---------- Wheel ----------
  function buildWheel() {
    const cx = 150, cy = 150, r = 136
    const seg = 360 / SEGMENTS
    const rad = (d) => (d * Math.PI) / 180
    // One slice centred on the top, then rotated into place
    const a0 = rad(-90 - seg / 2), a1 = rad(-90 + seg / 2)
    const d = `M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`

    let html = ''
    for (let i = 0; i < SEGMENTS; i++) {
      html += `<g transform="rotate(${i * seg} ${cx} ${cy})">` +
        `<path d="${d}" class="${i % 2 ? 'seg-b' : 'seg-a'} seg-line"/>` +
        `<text x="${cx}" y="${cy - 92}" class="seg-q">?</text></g>`
    }
    $('#wheelRot').innerHTML = html

    let lights = `<circle cx="${cx}" cy="${cy}" r="${r + 6}" class="rim"/>`
    for (let i = 0; i < 24; i++) {
      const a = rad(i * 15)
      lights += `<circle cx="${cx + (r + 6) * Math.cos(a)}" cy="${cy + (r + 6) * Math.sin(a)}" r="2.6" class="light"/>`
    }
    $('#lights').innerHTML = lights
  }

  function showTurn() {
    const name = state.names[state.turn]
    $('#turnStep').textContent = `Player ${state.turn + 1} of ${state.names.length}`
    $('#turnName').textContent = name
    $('#turnNameInline').textContent = name
    const btn = $('#spinBtn')
    btn.disabled = false
    btn.textContent = 'Spin the wheel'

    const dots = $('#turnDots')
    dots.innerHTML = ''
    state.names.forEach((_, i) => {
      dots.append(el('i', i < state.turn ? 'done' : i === state.turn ? 'now' : ''))
    })
    show('spin')
  }

  function flickPointer() {
    const p = $('.pointer')
    p.classList.remove('tick')
    void p.offsetWidth
    p.classList.add('tick')
  }

  function spin() {
    if (state.spinning) return
    state.spinning = true
    audio()
    const btn = $('#spinBtn')
    btn.disabled = true
    btn.textContent = 'Spinning...'
    $('#wheelWrap').classList.add('spinning')

    const rot = $('#wheelRot')
    const start = state.rotation
    const delta = 360 * 5 + rand(360)
    const duration = 3600 + rand(900)
    const segSize = 360 / SEGMENTS
    const t0 = performance.now()
    let lastSeg = Math.floor(start / segSize)

    function frame(now) {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 4)
      const angle = start + delta * eased
      rot.setAttribute('transform', `rotate(${angle} 150 150)`)
      const s = Math.floor(angle / segSize)
      if (s !== lastSeg) {
        lastSeg = s
        tick()
        flickPointer()
      }
      if (p < 1) return requestAnimationFrame(frame)

      state.rotation = angle % 360
      state.spinning = false
      $('#wheelWrap').classList.remove('spinning')
      thud()
      if (navigator.vibrate) navigator.vibrate(40)
      setTimeout(showReveal, 500)
    }
    requestAnimationFrame(frame)
  }

  // ---------- Reveal ----------
  function showReveal() {
    const i = state.turn
    const isImp = state.impostorSet.has(i)
    $('#revealName').textContent = state.names[i]

    const card = $('#roleCard')
    card.classList.remove('show')
    card.classList.toggle('is-impostor', isImp)
    card.classList.toggle('is-regular', !isImp)

    const inner = $('#roleInner')
    inner.innerHTML = ''
    if (isImp) {
      inner.append(el('span', 'role-tag bad', 'Impostor'))
      inner.append(el('div', 'role-word imp', "You're the impostor"))
      inner.append(el('div', 'role-sub', state.hint ? `Category: ${state.wordCategory}` : 'No hint this round'))
      inner.append(el('p', 'role-help', "You don't know the word. Listen, blend in, don't get caught."))
    } else {
      inner.append(el('span', 'role-tag ok', 'Regular'))
      inner.append(el('div', 'role-word', state.word))
      inner.append(el('div', 'role-sub', `Category: ${state.wordCategory}`))
      inner.append(el('p', 'role-help', 'Give clues about this word without saying it. Find the impostor.'))
    }

    const done = $('#doneBtn')
    done.disabled = true
    done.textContent = state.turn === state.names.length - 1 ? 'Hide and start the game' : 'Hide and pass'
    show('reveal')
  }

  function setRoleVisible(on) {
    $('#roleCard').classList.toggle('show', on)
    if (on) $('#doneBtn').disabled = false
  }

  function bindRoleCard() {
    const card = $('#roleCard')
    card.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      setRoleVisible(true)
      // Keeps the role visible if the thumb slides a bit while holding
      try { card.setPointerCapture(e.pointerId) } catch { /* not supported */ }
    })
    ;['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) =>
      card.addEventListener(ev, () => setRoleVisible(false)))
    card.addEventListener('contextmenu', (e) => e.preventDefault())
    card.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setRoleVisible(true) }
    })
    card.addEventListener('keyup', () => setRoleVisible(false))
    card.addEventListener('blur', () => setRoleVisible(false))
  }

  function nextPlayer() {
    setRoleVisible(false)
    state.turn++
    if (state.turn < state.names.length) showTurn()
    else showPlay()
  }

  // ---------- Play and result ----------
  function showPlay() {
    $('#starterName').textContent = state.names[state.starter]
    show('play')
  }

  function bindHoldReveal() {
    const btn = $('#revealImpBtn')
    let timer
    const cancel = () => { clearTimeout(timer); btn.classList.remove('holding') }
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      btn.classList.add('holding')
      timer = setTimeout(() => { cancel(); showResult() }, 1200)
    })
    ;['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel))
    btn.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  function showResult() {
    const imps = state.names.filter((_, i) => state.impostorSet.has(i))
    $('#resultLabel').textContent = imps.length > 1 ? 'The impostors were' : 'The impostor was'
    const list = $('#impList')
    list.innerHTML = ''
    imps.forEach((n) => list.append(el('div', 'imp-name', n)))
    $('#resultWord').textContent = state.word
    $('#resultCat').textContent = state.wordCategory
    thud()
    show('result')
  }

  // ---------- Wire up ----------
  function init() {
    load()
    buildWheel()
    renderOptions()
    renderPlayers()
    renderSound()
    buildCountChips()
    setCount(state.players.length)

    $('#countMinus').addEventListener('click', () => setCount(pickedCount - 1))
    $('#countPlus').addEventListener('click', () => setCount(pickedCount + 1))
    $('#countNext').addEventListener('click', confirmCount)
    $('#backToCount').addEventListener('click', () => { setCount(state.players.length); show('count') })
    $('#addPlayer').addEventListener('click', addPlayer)
    $('#impMinus').addEventListener('click', () => { state.impostors--; renderImpostors() })
    $('#impPlus').addEventListener('click', () => { state.impostors++; renderImpostors() })
    $('#categorySelect').addEventListener('change', (e) => { state.category = e.target.value; save() })
    $('#hintToggle').addEventListener('change', (e) => { state.hint = e.target.checked; save() })
    $('#soundBtn').addEventListener('click', () => { state.sound = !state.sound; save(); renderSound() })
    $('#startBtn').addEventListener('click', startRound)
    $('#spinBtn').addEventListener('click', spin)
    $('#doneBtn').addEventListener('click', nextPlayer)
    $('#againBtn').addEventListener('click', startRound)
    $('#editBtn').addEventListener('click', () => show('setup'))
    document.querySelectorAll('.quit').forEach((b) => b.addEventListener('click', quitRound))

    bindRoleCard()
    bindHoldReveal()
  }

  init()
})()
