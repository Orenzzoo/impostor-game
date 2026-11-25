// Menu, setup, role dealing (wheel + hold-to-reveal) and the Word Impostor round.
// Role Play Mafia's night/day loop lives in mafia.js.
;(() => {
  'use strict'

  const App = window.App
  const { $, el, rand, shuffle, show, state, save, load, audio, tick, thud, MIN_PLAYERS, MAX_PLAYERS } = App
  const CATEGORIES = window.CATEGORIES
  const Mafia = window.Mafia

  const SEGMENTS = 12
  const MODE_NAMES = { word: 'Word Impostor', mafia: 'Role Play Mafia' }
  // Leaving these screens doesn't lose a game in progress, so no confirm needed
  const SAFE_SCREENS = ['home', 'count', 'setup', 'result', 'mOver']

  const round = { word: '', wordCategory: '', starter: 0, used: {}, rotation: 0, spinning: false }

  function renderSound() {
    $('#soundBtn').classList.toggle('muted', !state.sound)
  }

  // ---------- Menu ----------
  function pickMode(mode) {
    state.mode = mode
    save()
    $('#countTitle').textContent = MODE_NAMES[mode]
    setCount(state.players.length)
    show('count')
  }

  function goHome() {
    const active = document.querySelector('.screen.active').id
    if (!SAFE_SCREENS.includes(active) && !confirm('Leave this game and go back to the menu?')) return
    Mafia.stop()
    show('home')
  }

  // ---------- Player count ----------
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

  // Saved names are kept and trimmed or padded to the picked count
  function confirmCount() {
    const p = state.players
    if (p.length > pickedCount) p.length = pickedCount
    while (p.length < pickedCount) p.push('')
    save()
    showSetup()
  }

  // ---------- Setup ----------
  function showSetup() {
    $('#setupMode').textContent = MODE_NAMES[state.mode]
    $('#wordOpts').hidden = state.mode !== 'word'
    $('#mafiaOpts').hidden = state.mode !== 'mafia'
    renderPlayers()
    show('setup')
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
    renderMafiaOpts()
  }

  function addPlayer() {
    state.players.push('')
    save()
    renderPlayers()
    const inputs = $('#playerList').querySelectorAll('input')
    inputs[inputs.length - 1].focus()
  }

  function maxImpostors() {
    return Math.max(1, Math.floor((state.players.length - 1) / 2))
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

  function renderMafiaOpts() {
    const n = state.players.length
    const max = Mafia.maxMafia(n)
    state.mafiaCount = Math.min(Math.max(1, state.mafiaCount), max)
    $('#mafCount').textContent = state.mafiaCount
    $('#mafMax').textContent = max
    $('#mafMinus').disabled = state.mafiaCount <= 1
    $('#mafPlus').disabled = state.mafiaCount >= max
    $('#docToggle').checked = state.doctor
    $('#detToggle').checked = state.detective
    $('#jesToggle').checked = state.jester

    const civilians = n - Mafia.specialCount()
    $('#mafSummary').textContent = [
      `${state.mafiaCount} Mafia`,
      state.doctor && '1 Doctor',
      state.detective && '1 Detective',
      state.jester && '1 Jester',
      `${Math.max(0, civilians)} Civilian${civilians === 1 ? '' : 's'}`
    ].filter(Boolean).join(' · ')

    const tooMany = state.mode === 'mafia' && civilians < 0
    const err = $('#setupError')
    err.hidden = !tooMany
    err.textContent = tooMany ? `Too many roles for ${n} players. Turn one off or add players.` : ''
    $('#startBtn').disabled = tooMany
    save()
  }

  function renderCategories() {
    const sel = $('#categorySelect')
    sel.innerHTML = ''
    sel.append(new Option('Random', 'random'))
    Object.keys(CATEGORIES).forEach((c) => sel.append(new Option(c, c)))
    sel.value = state.category
  }

  // ---------- Round ----------
  function pickWord() {
    const keys = Object.keys(CATEGORIES)
    const category = state.category === 'random' ? keys[rand(keys.length)] : state.category
    const used = round.used[category] || (round.used[category] = [])
    let pool = CATEGORIES[category].filter((w) => !used.includes(w))
    if (!pool.length) {
      used.length = 0
      pool = CATEGORIES[category].slice()
    }
    const word = pool[rand(pool.length)]
    used.push(word)
    return { category, word }
  }

  // Roles are dealt up front so the counts are always exact.
  // The wheel is only for show; it never decides anything.
  function startRound() {
    const n = state.players.length
    state.names = state.players.map((p, i) => p.trim() || `Player ${i + 1}`)
    Mafia.stop()
    if (state.mode === 'mafia') {
      state.roles = Mafia.deal(n)
    } else {
      const imps = new Set(shuffle([...Array(n).keys()]).slice(0, state.impostors))
      state.roles = state.names.map((_, i) => (imps.has(i) ? 'impostor' : 'regular'))
      const { category, word } = pickWord()
      round.word = word
      round.wordCategory = category
      round.starter = rand(n)
    }
    state.turn = 0
    showTurn()
  }

  function quitRound() {
    if (!confirm('End this game? Roles will be dealt again next time.')) return
    Mafia.stop()
    showSetup()
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
    $('#hubBtn').disabled = false

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
    if (round.spinning) return
    round.spinning = true
    audio()
    const btn = $('#spinBtn')
    btn.disabled = true
    btn.textContent = 'Spinning...'
    $('#hubBtn').disabled = true
    $('#wheelWrap').classList.add('spinning')

    const rot = $('#wheelRot')
    const start = round.rotation
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

      round.rotation = angle % 360
      round.spinning = false
      $('#wheelWrap').classList.remove('spinning')
      thud()
      if (navigator.vibrate) navigator.vibrate(40)
      setTimeout(showReveal, 500)
    }
    requestAnimationFrame(frame)
  }

  // ---------- Reveal ----------
  function cardFor(i) {
    if (state.mode === 'mafia') return Mafia.cardFor(i)
    if (state.roles[i] === 'impostor') {
      // The impostor gets no word and no category, only what they hear from others
      return {
        tag: 'Impostor', theme: 'red', title: "You're the impostor", small: true, sub: '',
        help: "You don't know the word or the category. Listen, blend in, don't get caught."
      }
    }
    return {
      tag: 'Regular', theme: 'mint', title: round.word, sub: `Category: ${round.wordCategory}`,
      help: 'Give clues about this word without saying it. Find the impostor.'
    }
  }

  function showReveal() {
    const i = state.turn
    const c = cardFor(i)
    $('#revealName').textContent = state.names[i]
    $('#roleCard').className = `role-card theme-${c.theme}`

    const inner = $('#roleInner')
    inner.innerHTML = ''
    inner.append(el('span', `role-tag t-${c.theme}`, c.tag))
    inner.append(el('div', `role-word t-${c.theme}${c.small ? ' small' : ''}`, c.title))
    if (c.sub) inner.append(el('div', 'role-sub', c.sub))
    inner.append(el('p', 'role-help', c.help))

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
    else if (state.mode === 'mafia') Mafia.start()
    else showPlay()
  }

  // ---------- Word Impostor: play and result ----------
  function showPlay() {
    $('#starterName').textContent = state.names[round.starter]
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
    const imps = state.names.filter((_, i) => state.roles[i] === 'impostor')
    $('#resultLabel').textContent = imps.length > 1 ? 'The impostors were' : 'The impostor was'
    const list = $('#impList')
    list.innerHTML = ''
    imps.forEach((n) => list.append(el('div', 'imp-name', n)))
    $('#resultWord').textContent = round.word
    $('#resultCat').textContent = round.wordCategory
    thud()
    show('result')
  }

  // ---------- Wire up ----------
  function init() {
    load()
    App.startRound = startRound
    buildWheel()
    buildCountChips()
    renderCategories()
    renderSound()
    Mafia.init()

    document.querySelectorAll('.mode-card').forEach((b) =>
      b.addEventListener('click', () => pickMode(b.dataset.mode)))
    $('#homeBtn').addEventListener('click', goHome)
    $('#backToHome').addEventListener('click', () => show('home'))

    $('#countMinus').addEventListener('click', () => setCount(pickedCount - 1))
    $('#countPlus').addEventListener('click', () => setCount(pickedCount + 1))
    $('#countNext').addEventListener('click', confirmCount)
    $('#backToCount').addEventListener('click', () => { setCount(state.players.length); show('count') })

    $('#addPlayer').addEventListener('click', addPlayer)
    $('#impMinus').addEventListener('click', () => { state.impostors--; renderImpostors() })
    $('#impPlus').addEventListener('click', () => { state.impostors++; renderImpostors() })
    $('#categorySelect').addEventListener('change', (e) => { state.category = e.target.value; save() })
    $('#mafMinus').addEventListener('click', () => { state.mafiaCount--; renderMafiaOpts() })
    $('#mafPlus').addEventListener('click', () => { state.mafiaCount++; renderMafiaOpts() })
    $('#docToggle').addEventListener('change', (e) => { state.doctor = e.target.checked; renderMafiaOpts() })
    $('#detToggle').addEventListener('change', (e) => { state.detective = e.target.checked; renderMafiaOpts() })
    $('#jesToggle').addEventListener('change', (e) => { state.jester = e.target.checked; renderMafiaOpts() })
    $('#soundBtn').addEventListener('click', () => { state.sound = !state.sound; save(); renderSound() })
    $('#startBtn').addEventListener('click', startRound)

    $('#spinBtn').addEventListener('click', spin)
    $('#hubBtn').addEventListener('click', spin)
    $('#doneBtn').addEventListener('click', nextPlayer)
    $('#againBtn').addEventListener('click', startRound)
    $('#editBtn').addEventListener('click', showSetup)
    document.querySelectorAll('.quit').forEach((b) => b.addEventListener('click', quitRound))

    bindRoleCard()
    bindHoldReveal()
  }

  init()
})()
