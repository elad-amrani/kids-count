// ─────────────────────────────────────────────────────────────
// NUMBER DATA
// ─────────────────────────────────────────────────────────────
const NUMBERS = [
  { id:  1, word: 'one'      },
  { id:  2, word: 'two'      },
  { id:  3, word: 'three'    },
  { id:  4, word: 'four'     },
  { id:  5, word: 'five'     },
  { id:  6, word: 'six'      },
  { id:  7, word: 'seven'    },
  { id:  8, word: 'eight'    },
  { id:  9, word: 'nine'     },
  { id: 10, word: 'ten'      },
  { id: 11, word: 'eleven'   },
  { id: 12, word: 'twelve'   },
  { id: 13, word: 'thirteen' },
  { id: 14, word: 'fourteen' },
  { id: 15, word: 'fifteen'  },
  { id: 16, word: 'sixteen'  },
  { id: 17, word: 'seventeen'},
  { id: 18, word: 'eighteen' },
  { id: 19, word: 'nineteen' },
  { id: 20, word: 'twenty'   },
];

// ─────────────────────────────────────────────────────────────
// AUDIO
// ─────────────────────────────────────────────────────────────
let currentAudio = null;

function playSound(filename) {
  if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; }
  const audio = new Audio(`sounds/${filename}`);
  currentAudio = audio;
  audio.play().catch(() => {});
}

function playCorrect() { playSound('correct.mp3'); }
function playWrong()   { playSound('incorrect.mp3'); }

function speakNumber(num) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(num.word);
  utt.rate  = 0.85;
  utt.pitch = 1.1;
  window.speechSynthesis.speak(utt);
}

// ─────────────────────────────────────────────────────────────
// EMOJI GRID HELPER
// ─────────────────────────────────────────────────────────────
const EMOJIS = ['🍎','🍊','🍋','🍇','🍓','🌸','⭐','🦋','🐶','🐱','🦄','🍭','🎈','🚀','🌈'];

function randomEmoji() {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

function makeEmojiGrid(count, emoji, size = 'small') {
  const grid = document.createElement('div');
  grid.className = `emoji-grid ${size}`;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    dot.className   = 'emoji-dot';
    dot.textContent = emoji;
    grid.appendChild(dot);
  }
  return grid;
}

// ─────────────────────────────────────────────────────────────
// SPACED REPETITION  (SM-2)
// ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'kids_count_cards_v1';

function loadCards() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
function saveCards(c) { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); }

function defaultCard(id) {
  return { id, interval: 0, easeFactor: 2.5, repetitions: 0, dueDate: 0, introduced: false };
}

function updateCard(numberId, correct) {
  const cards = loadCards();
  const card  = cards[numberId] || defaultCard(numberId);
  const q     = correct ? 5 : 1;

  if (q >= 3) {
    if      (card.repetitions === 0) card.interval = 1;
    else if (card.repetitions === 1) card.interval = 6;
    else                             card.interval = Math.round(card.interval * card.easeFactor);
    card.repetitions++;
  } else {
    card.repetitions = 0;
    card.interval    = 1;
  }

  card.easeFactor  = Math.max(1.3, card.easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  card.dueDate     = Date.now() + card.interval * 24 * 60 * 60 * 1000;
  card.introduced  = true;
  cards[numberId]  = card;
  saveCards(cards);
}

// ─────────────────────────────────────────────────────────────
// SESSION
// ─────────────────────────────────────────────────────────────
const ACTIVE_POOL_SIZE = 4;
const GRADUATE_REPS    = 2;  // correct answers needed to graduate a number

function getSessionCards() {
  const cards = loadCards();

  // Active = introduced but not yet answered correctly enough times
  const active = NUMBERS.filter(n => {
    const c = cards[n.id];
    return c?.introduced && (c.repetitions || 0) < GRADUATE_REPS;
  });

  // Fill empty slots with the next unintroduced numbers
  const slots   = Math.max(0, ACTIVE_POOL_SIZE - active.length);
  const newOnes = NUMBERS.filter(n => !cards[n.id]?.introduced).slice(0, slots);

  return shuffle([...active, ...newOnes]);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────
// QUESTION GENERATION
// ─────────────────────────────────────────────────────────────
function generateQuestion(target) {
  const mode = Math.random() < 0.5 ? 'numeral-to-objects' : 'objects-to-numeral';

  // Prefer nearby numbers as distractors so counts stay comparable
  const byDistance = NUMBERS
    .filter(n => n.id !== target.id)
    .sort((a, b) => Math.abs(a.id - target.id) - Math.abs(b.id - target.id));

  const distractors = byDistance.slice(0, 3);
  const choices     = shuffle([...distractors, target]);
  const emoji       = randomEmoji();
  return { mode, target, choices, emoji };
}

// ─────────────────────────────────────────────────────────────
// APP STATE
// ─────────────────────────────────────────────────────────────
let sessionCards    = [];
let currentIndex    = 0;
let currentQuestion = null;
let sessionStars    = 0;
let streak          = 0;
let answered        = false;
let totalStars      = 0;
let speakTimer      = null;

// ─────────────────────────────────────────────────────────────
// INIT / FLOW
// ─────────────────────────────────────────────────────────────
function init() {
  totalStars   = parseInt(localStorage.getItem('total_stars') || '0');
  sessionStars = 0;
  streak       = 0;
  sessionCards = getSessionCards();
  currentIndex = 0;
  if (sessionCards.length === 0) { renderAllCaughtUp(); return; }
  renderQuestion();
}

function nextQuestion() {
  currentIndex++;
  if (currentIndex >= sessionCards.length) { renderSessionComplete(); return; }
  renderQuestion();
}

// ─────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────
function renderQuestion() {
  answered        = false;
  const target    = sessionCards[currentIndex];
  currentQuestion = generateQuestion(target);

  const area = document.getElementById('quiz-area');
  area.innerHTML = '';
  updateHeader();

  if (currentQuestion.mode === 'numeral-to-objects') {
    renderNumeralToObjects(area);
  } else {
    renderObjectsToNumeral(area);
  }
}

function renderNumeralToObjects(container) {
  const { target, choices, emoji } = currentQuestion;

  container.appendChild(makeInstruction(`How many ${emoji} match this number?`));

  const card = document.createElement('div');
  card.className = 'question-card';
  const big = document.createElement('div');
  big.className   = 'big-number';
  big.textContent = target.id;
  card.appendChild(big);
  container.appendChild(card);

  speakTimer = setTimeout(() => speakNumber(target), 300);

  container.appendChild(makeChoices(choices, target, /* showObjects */ true, emoji));
}

function renderObjectsToNumeral(container) {
  const { target, choices, emoji } = currentQuestion;

  container.appendChild(makeInstruction('What number is this?'));

  const card = document.createElement('div');
  card.className = 'question-card';
  card.appendChild(makeEmojiGrid(target.id, emoji, 'large'));
  container.appendChild(card);

  container.appendChild(makeChoices(choices, target, /* showObjects */ false, emoji));
}

// ─────────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────────
function makeInstruction(text) {
  const el = document.createElement('div');
  el.className   = 'instruction';
  el.textContent = text;
  return el;
}

function makeChoices(choices, target, showObjects, emoji) {
  const grid = document.createElement('div');
  grid.className = 'choices';

  choices.forEach(num => {
    const btn = document.createElement('button');
    btn.className  = 'choice-btn';
    btn.dataset.id = num.id;

    if (showObjects) {
      btn.appendChild(makeEmojiGrid(num.id, emoji, 'small'));
    } else {
      btn.textContent = num.id;
    }

    btn.addEventListener('click', () => {
      if (answered) return;
      handleAnswer(btn, num.id === target.id);
    });

    grid.appendChild(btn);
  });

  return grid;
}

// ─────────────────────────────────────────────────────────────
// ANSWER HANDLING
// ─────────────────────────────────────────────────────────────
function handleAnswer(btn, correct) {
  answered = true;
  clearTimeout(speakTimer);
  window.speechSynthesis.cancel();
  document.querySelectorAll('.choice-btn').forEach(b => { b.disabled = true; });

  if (correct) {
    btn.classList.add('correct');
    playCorrect();
    streak++;
    sessionStars++;
    totalStars++;
    localStorage.setItem('total_stars', totalStars);
    updateHeader();

    if (streak > 0 && streak % 5 === 0) {
      showOverlay('🌟', '🎉 Amazing! 🎉', `${streak} in a row!`);
      setTimeout(nextQuestion, 2600);
    } else {
      setTimeout(nextQuestion, 1200);
    }
  } else {
    btn.classList.add('wrong');
    playWrong();
    streak = 0;
    updateHeader();

    document.querySelectorAll('.choice-btn').forEach(b => {
      if (Number(b.dataset.id) === currentQuestion.target.id) b.classList.add('correct');
    });

    setTimeout(nextQuestion, 1900);
  }

  updateCard(currentQuestion.target.id, correct);
}

// ─────────────────────────────────────────────────────────────
// HEADER / OVERLAY / END SCREENS
// ─────────────────────────────────────────────────────────────
function updateHeader() {
  document.getElementById('star-count').textContent   = totalStars;
  document.getElementById('streak-count').textContent = streak;
  document.getElementById('session-progress').textContent =
    `${Math.min(currentIndex + 1, sessionCards.length)} / ${sessionCards.length}`;
}

function showOverlay(emoji, title, sub) {
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = `
    <div class="overlay-emoji">${emoji}</div>
    <div class="overlay-title">${title}</div>
    <div class="overlay-sub">${sub}</div>
  `;
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.add('hidden'), 2200);
}

function renderSessionComplete() {
  const area  = document.getElementById('quiz-area');
  const emoji = sessionStars === sessionCards.length ? '🏆' : '🎊';
  area.innerHTML = `
    <div class="complete-screen">
      <h1>${emoji} Great job! ${emoji}</h1>
      <p>You got <strong>${sessionStars}</strong> out of <strong>${sessionCards.length}</strong> right!</p>
      <p>Total stars: ⭐ ${totalStars}</p>
      <button class="play-again-btn" id="play-again">Play Again! 🚀</button>
    </div>
  `;
  document.getElementById('play-again').addEventListener('click', init);
}

function renderAllCaughtUp() {
  const area = document.getElementById('quiz-area');
  area.innerHTML = `
    <div class="complete-screen">
      <h1>🌈 All caught up!</h1>
      <p>Come back tomorrow for more practice.</p>
      <p>Total stars: ⭐ ${totalStars}</p>
      <button class="play-again-btn" id="play-again">Play Again! 🚀</button>
    </div>
  `;
  document.getElementById('play-again').addEventListener('click', init);
}

// ─────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Reset all progress and stars?')) {
      localStorage.clear();
      init();
    }
  });
  init();
});
