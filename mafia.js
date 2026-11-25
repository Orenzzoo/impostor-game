// Role Play Mafia. The phone is the host: it narrates the night out loud,
// takes each role's pick, announces the morning, and runs the vote.
;(() => {
  'use strict'

  const { $, el, rand, shuffle, sleep, show, state, speak, thud } = window.App

  const ROLES = {
    mafia: {
      name: 'Mafia', the: 'Mafia', theme: 'red',
      help: 'Each night, open your eyes with your team and pick someone to eliminate. By day, act innocent.'
    },
    doctor: {
      name: 'Doctor', the: 'the Doctor', theme: 'mint',
      help: 'Each night, pick one person to save. If the Mafia chose them, they live. You can save yourself.'
    },
    detective: {
      name: 'Detective', the: 'the Detective', theme: 'blue',
      help: 'Each night, pick one person. The phone tells you if they are Mafia.'
    },
    jester: {
      name: 'Jester', the: 'the Jester', theme: 'purple',
      help: 'You win if the town votes you out. Act suspicious, but not too obvious.'
    },
    civilian: {
      name: 'Civilian', the: 'a Civilian', theme: 'gray',
      help: 'No powers. Talk, find the Mafia, and vote them out.'
    }
  }

  const STEPS = {
    mafia: { call: 'Mafia', ask: 'Choose who to eliminate.', verb: 'Eliminate' },
    doctor: { call: 'Doctor', ask: 'Choose someone to save.', verb: 'Save' },
    detective: { call: 'Detective', ask: 'Choose someone to check.', verb: 'Check' }
  }

  const WINNERS = {
    town: { title: 'Town wins', why: 'Every Mafia member is out.', theme: 'mint' },
    mafia: { title: 'Mafia wins', why: 'The Mafia now match the town in numbers.', theme: 'red' },
    jester: { title: 'Jester wins', why: 'The town voted out the Jester.', theme: 'purple' }
  }

  const DISCUSS_SECONDS = 120

  const game = { alive: [], night: 0, token: 0, timer: null, left: DISCUSS_SECONDS, wakeLock: null }

  // Thrown when the game is ended mid-night, so the narration loop stops
  class Cancelled extends Error {}
  function guard(token) {
    if (token !== game.token) throw new Cancelled()
  }

  // ---------- Setup and dealing ----------
  function maxMafia(n) {
    return Math.max(1, Math.floor((n - 1) / 3))
  }

  function specialCount() {
    return state.mafiaCount + Number(state.doctor) + Number(state.detective) + Number(state.jester)
  }

  function deal(n) {
    const order = shuffle([...Array(n).keys()])
    const roles = Array(n).fill('civilian')
    const take = (role) => { roles[order.pop()] = role }
    for (let i = 0; i < state.mafiaCount; i++) take('mafia')
    if (state.doctor) take('doctor')
    if (state.detective) take('detective')
    if (state.jester) take('jester')
    return roles
  }

  function cardFor(i) {
    const role = state.roles[i]
    const info = ROLES[role]
    let sub = ''
    if (role === 'mafia') {
      const team = state.names.filter((_, j) => j !== i && state.roles[j] === 'mafia')
      sub = team.length ? `Your team: ${team.join(', ')}` : 'You work alone'
    }
    return { tag: 'Your role', theme: info.theme, title: info.name, sub, help: info.help }
  }

  const aliveIdx = (fn = () => true) =>
    state.names.map((_, i) => i).filter((i) => game.alive[i] && fn(i))

  // ---------- Night ----------
  async function narrate(token, text, ms) {
    guard(token)
    $('#narrateText').textContent = text
    show('mNarrate')
    speak(text)
    await sleep(ms)
    guard(token)
  }

  // Shows a grid of names; resolves with the picked index (-1 for the skip option)
  function choose(list, btn, candidates, verb, skipLabel) {
    return new Promise((resolve) => {
      list.innerHTML = ''
      let picked = null
      btn.hidden = false
      btn.disabled = true
      btn.textContent = 'Pick someone'
      candidates.forEach((i) => {
        const b = el('button', i === -1 ? 'pick pick-skip' : 'pick', i === -1 ? skipLabel : state.names[i])
        b.addEventListener('click', () => {
          list.querySelectorAll('.pick').forEach((p) => p.classList.toggle('on', p === b))
          picked = i
          btn.disabled = false
          btn.textContent = i === -1 ? 'Skip the vote' : `${verb} ${state.names[i]}`
        })
        list.append(b)
      })
      btn.onclick = () => { if (picked !== null) resolve(picked) }
    })
  }

  function showCheck(i) {
    return new Promise((resolve) => {
      const isMafia = state.roles[i] === 'mafia'
      $('#nightList').innerHTML = ''
      $('#nightAsk').textContent = 'Remember this, then close your eyes.'
      const res = $('#nightResult')
      res.hidden = false
      res.className = `check ${isMafia ? 't-red' : 't-mint'}`
      res.innerHTML = ''
      res.append(el('div', 'check-name', state.names[i]), el('div', 'check-verdict', isMafia ? 'is Mafia' : 'is not Mafia'))
      const btn = $('#nightConfirm')
      btn.disabled = false
      btn.textContent = 'Got it'
      btn.onclick = () => resolve()
    })
  }

  async function roleStep(token, role) {
    guard(token)
    const step = STEPS[role]
    const holders = aliveIdx((i) => state.roles[i] === role)
    const list = $('#nightList')
    const btn = $('#nightConfirm')
    $('#nightTitle').textContent = `${step.call}, open your eyes`
    $('#nightAsk').textContent = step.ask
    $('#nightResult').hidden = true
    show('mNight')
    speak(`${step.call}, open your eyes. ${step.ask}`)

    let pick = null
    if (!holders.length) {
      // This role is out, but it's still called so nobody learns that from the silence
      list.innerHTML = ''
      list.append(el('p', 'hint center wide', 'Waiting...'))
      btn.hidden = true
      await sleep(7000 + rand(4000))
    } else {
      const candidates = aliveIdx((i) => {
        if (role === 'mafia') return state.roles[i] !== 'mafia'
        if (role === 'detective') return !holders.includes(i)
        return true
      })
      pick = await choose(list, btn, candidates, step.verb)
      guard(token)
      if (role === 'detective') await showCheck(pick)
    }
    await narrate(token, `${step.call}, close your eyes.`, 3500)
    return pick
  }

  async function runNight() {
    const token = ++game.token
    try {
      game.night++
      await narrate(token, `Night ${game.night}. Everyone, close your eyes.`, 5000)
      const target = await roleStep(token, 'mafia')
      const saved = state.doctor ? await roleStep(token, 'doctor') : null
      if (state.detective) await roleStep(token, 'detective')
      await narrate(token, 'Everyone, open your eyes.', 2500)

      let msg
      if (target !== saved) {
        game.alive[target] = false
        msg = `${state.names[target]} was eliminated during the night.`
      } else {
        msg = 'The Mafia attacked, but the Doctor saved them. Nobody died.'
      }
      if (!checkWin(msg)) showDay(msg)
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e
    }
  }

  // ---------- Day ----------
  function renderRoster(box, withRoles) {
    box.innerHTML = ''
    state.names.forEach((name, i) => {
      const chip = el('div', game.alive[i] ? 'chip' : 'chip dead')
      chip.append(el('span', 'chip-name', name))
      if (withRoles) {
        const info = ROLES[state.roles[i]]
        chip.append(el('span', `chip-role t-${info.theme}`, info.name))
      }
      box.append(chip)
    })
  }

  function showDay(msg) {
    $('#dayTitle').textContent = `Day ${game.night}`
    $('#dayMsg').textContent = msg
    renderRoster($('#dayRoster'), false)
    resetTimer()
    show('mDay')
    thud()
    speak(msg)
  }

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  function renderTimer() {
    $('#timerText').textContent = fmt(game.left)
    $('#timerText').classList.toggle('low', game.left <= 10)
    let label = 'Resume'
    if (game.timer) label = 'Pause'
    else if (game.left === DISCUSS_SECONDS) label = 'Start timer'
    else if (game.left === 0) label = 'Restart'
    $('#timerBtn').textContent = label
  }

  function stopTimer() {
    clearInterval(game.timer)
    game.timer = null
    renderTimer()
  }

  function resetTimer() {
    clearInterval(game.timer)
    game.timer = null
    game.left = DISCUSS_SECONDS
    renderTimer()
  }

  function toggleTimer() {
    if (game.timer) return stopTimer()
    if (game.left <= 0) game.left = DISCUSS_SECONDS
    game.timer = setInterval(() => {
      game.left = Math.max(0, game.left - 1)
      if (game.left === 0) {
        stopTimer()
        thud()
        speak("Time's up. Time to vote.")
        return
      }
      renderTimer()
    }, 1000)
    renderTimer()
  }

  // ---------- Vote ----------
  async function runVote() {
    stopTimer()
    const token = ++game.token
    show('mVote')
    const pick = await choose($('#voteList'), $('#voteConfirm'), [...aliveIdx(), -1], 'Vote out', 'Nobody')
    if (token !== game.token) return

    if (pick === -1) return showVerdict('Nobody was voted out.', "The town couldn't agree.", 'gray')

    game.alive[pick] = false
    const info = ROLES[state.roles[pick]]
    const name = state.names[pick]
    const note = `${name} was voted out. They were ${info.the}.`
    if (state.roles[pick] === 'jester') return gameOver('jester', note)
    if (checkWin(note)) return
    showVerdict(`${name} was voted out.`, `They were ${info.the}.`, info.theme)
  }

  function showVerdict(title, sub, theme) {
    $('#verdictTitle').textContent = title
    const subEl = $('#verdictSub')
    subEl.textContent = sub
    subEl.className = `verdict-sub t-${theme}`
    $('#verdictNext').textContent = `Start night ${game.night + 1}`
    show('mVerdict')
    thud()
    speak(`${title} ${sub}`)
  }

  // ---------- End ----------
  function checkWin(note) {
    const alive = aliveIdx()
    const mafia = alive.filter((i) => state.roles[i] === 'mafia').length
    if (mafia === 0) { gameOver('town', note); return true }
    if (mafia >= alive.length - mafia) { gameOver('mafia', note); return true }
    return false
  }

  function gameOver(winner, note) {
    stopTimer()
    releaseWake()
    const w = WINNERS[winner]
    const title = $('#overTitle')
    title.textContent = w.title
    title.className = `over-title t-${w.theme}`
    $('#overWhy').textContent = note ? `${note} ${w.why}` : w.why
    renderRoster($('#overRoster'), true)
    show('mOver')
    thud()
    speak(`${note || ''} ${w.title}.`)
  }

  // Keep the screen on during long nights with the phone lying in the middle
  async function requestWake() {
    try { game.wakeLock = await navigator.wakeLock.request('screen') } catch { /* not supported */ }
  }

  function releaseWake() {
    try { if (game.wakeLock) game.wakeLock.release() } catch { /* ignore */ }
    game.wakeLock = null
  }

  function start() {
    game.token++
    game.alive = state.names.map(() => true)
    game.night = 0
    requestWake()
    show('mIntro')
  }

  function stop() {
    game.token++
    clearInterval(game.timer)
    game.timer = null
    releaseWake()
    if (window.speechSynthesis) speechSynthesis.cancel()
  }

  function init() {
    $('#introStart').addEventListener('click', runNight)
    $('#verdictNext').addEventListener('click', runNight)
    $('#toVote').addEventListener('click', runVote)
    $('#timerBtn').addEventListener('click', toggleTimer)
    $('#timerAdd').addEventListener('click', () => { game.left += 30; renderTimer() })
    $('#overAgain').addEventListener('click', () => window.App.startRound())
    $('#overMenu').addEventListener('click', () => show('home'))
  }

  window.Mafia = { maxMafia, specialCount, deal, cardFor, start, stop, init }
})()
