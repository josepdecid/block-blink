import './index.css';
import moonIconUrl from './icons/moon.svg';
import sunIconUrl from './icons/sun.svg';
import volumeIconUrl from './icons/volume.svg';
import mutedIconUrl from './icons/muted.svg';

const config = {
  gridSize: 5,
  guessDurationMs: 10_000,
  showDurationMs: 2_600,
  revealStepMs: 550,
  resultDurationMs: 1_900,
  minBlocks: 2,
  maxBlocks: 7,
};

document.querySelector('#root').innerHTML = `
  <main class="game-shell">
    <header class="top-copy">
      <p class="prompt">How many blocks were there?</p>
      <p class="phase-copy" id="phase-copy">Memorize the pattern.</p>
    </header>

    <div class="top-buttons">
      <button class="sound-toggle" id="sound-toggle" type="button" aria-label="Mute sound">
        <img src="${volumeIconUrl}" alt="" width="20" height="20">
      </button>
      <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Toggle theme">
        <img src="${moonIconUrl}" alt="" width="20" height="20">
      </button>
    </div>

    <section class="play-area">
      <div class="hero-count" id="hero-count">?</div>
      <canvas class="game-canvas" id="game-canvas" aria-label="Block counting game"></canvas>
    </section>

    <aside class="results-panel" id="results-panel">
      <p class="results-label">Round</p>
      <p class="results-value" id="round-value">1</p>

      <p class="results-label">Timer</p>
      <p class="results-value timer-value" id="timer-value">0.0s</p>

      <p class="results-label">Your Guess</p>
      <div class="guess-result">
        <span class="guess-number" id="guess-number">0</span>
        <span class="guess-mark" id="guess-mark"></span>
      </div>

      <p class="results-label">Actual</p>
      <p class="results-value" id="actual-value">-</p>
    </aside>

    <div class="control-bar" aria-label="Game controls">
      <button class="control-button control-button--primary" id="increment-button" type="button">
        Add Block
      </button>
      <button class="control-button" id="submit-button" type="button">
        Check Now
      </button>
    </div>
  </main>
`;

const canvas = document.querySelector('#game-canvas');
const context = canvas.getContext('2d');
const phaseCopy = document.querySelector('#phase-copy');
const heroCount = document.querySelector('#hero-count');
const roundValue = document.querySelector('#round-value');
const timerValue = document.querySelector('#timer-value');
const guessNumber = document.querySelector('#guess-number');
const guessMark = document.querySelector('#guess-mark');
const actualValue = document.querySelector('#actual-value');
const resultsPanel = document.querySelector('#results-panel');
const incrementButton = document.querySelector('#increment-button');
const submitButton = document.querySelector('#submit-button');

const state = {
  round: 0,
  phase: 'showing',
  guess: 0,
  blocks: [],
  revealIndex: 0,
  submittedGuess: null,
  result: null,
  phaseEndsAt: 0,
};

const timers = new Set();
let animationFrameId = 0;
let audioContext = null;
let isMuted = false;
let lastPulseAt = 0;

function schedule(callback, delay) {
  const id = window.setTimeout(() => {
    timers.delete(id);
    callback();
  }, delay);
  timers.add(id);
}

function clearTimers() {
  for (const id of timers) {
    window.clearTimeout(id);
  }
  timers.clear();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sampleUniqueCells(count) {
  const cells = [];
  for (let x = 0; x < config.gridSize; x += 1) {
    for (let y = 0; y < config.gridSize; y += 1) {
      cells.push({ x, y });
    }
  }

  for (let index = cells.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cells[index], cells[swapIndex]] = [cells[swapIndex], cells[index]];
  }

  return cells.slice(0, count).sort((left, right) => {
    const leftDepth = left.x + left.y;
    const rightDepth = right.x + right.y;
    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }

    return left.x - right.x;
  });
}

function getBlockCountForRound(round) {
  const growth = Math.floor((round - 1) / 2);
  const min = clamp(
    config.minBlocks + growth,
    config.minBlocks,
    config.maxBlocks - 1,
  );
  const max = clamp(min + 2, min, config.maxBlocks);

  return min + Math.floor(Math.random() * (max - min + 1));
}

function startRound() {
  clearTimers();
  state.round += 1;
  state.phase = 'showing';
  state.guess = 0;
  state.revealIndex = 0;
  state.submittedGuess = null;
  state.result = null;
  state.blocks = sampleUniqueCells(getBlockCountForRound(state.round));
  state.phaseEndsAt = performance.now() + config.showDurationMs;
  lastPulseAt = performance.now();
  updateHud();
  schedule(beginGuessing, config.showDurationMs);
}

function beginGuessing() {
  state.phase = 'guessing';
  state.phaseEndsAt = performance.now() + config.guessDurationMs;
  updateHud();
  schedule(submitGuess, config.guessDurationMs);
}

function submitGuess() {
  if (state.phase !== 'guessing') {
    return;
  }

  state.phase = 'revealing';
  state.phaseEndsAt = 0;
  state.submittedGuess = state.guess;
  state.revealIndex = 0;
  state.result = null;
  updateHud();
  schedule(revealNextBlock, 250);
}

function revealNextBlock() {
  if (state.phase !== 'revealing') {
    return;
  }

  if (state.revealIndex < state.blocks.length) {
    state.revealIndex += 1;
    lastPulseAt = performance.now();
    playBeep();
    updateHud();
    schedule(revealNextBlock, config.revealStepMs);
    return;
  }

  state.phase = 'result';
  state.result =
    state.submittedGuess === state.blocks.length ? 'correct' : 'incorrect';
  state.phaseEndsAt = performance.now() + config.resultDurationMs;
  updateHud();
  schedule(startRound, config.resultDurationMs);
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new window.AudioContext();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function playBeep() {
  if (isMuted) return;
  ensureAudioContext();

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(780, now);
  gainNode.gain.setValueAtTime(0.001, now);
  gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.18);
}

function projectPoint(
  originX,
  originY,
  tileWidth,
  tileHeight,
  cubeHeight,
  x,
  y,
  z = 0,
) {
  return {
    x: originX + (x - y) * (tileWidth / 2),
    y: originY + (x + y) * (tileHeight / 2) - z * cubeHeight,
  };
}

function drawPath(points) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.closePath();
}

function fillPolygon(points, fillStyle, strokeStyle) {
  drawPath(points);
  context.fillStyle = fillStyle;
  context.fill();
  context.strokeStyle = strokeStyle;
  context.stroke();
}

function drawGrid(originX, originY, tileWidth, tileHeight) {
  context.save();
  context.lineWidth = 1;
  context.strokeStyle = isDarkTheme()
    ? 'rgba(148, 163, 184, 0.25)'
    : 'rgba(0, 0, 0, 0.12)';

  for (let index = 0; index <= config.gridSize; index += 1) {
    const lineStartA = projectPoint(
      originX,
      originY,
      tileWidth,
      tileHeight,
      0,
      index,
      0,
      0,
    );
    const lineEndA = projectPoint(
      originX,
      originY,
      tileWidth,
      tileHeight,
      0,
      index,
      config.gridSize,
      0,
    );
    const lineStartB = projectPoint(
      originX,
      originY,
      tileWidth,
      tileHeight,
      0,
      0,
      index,
      0,
    );
    const lineEndB = projectPoint(
      originX,
      originY,
      tileWidth,
      tileHeight,
      0,
      config.gridSize,
      index,
      0,
    );

    context.beginPath();
    context.moveTo(lineStartA.x, lineStartA.y);
    context.lineTo(lineEndA.x, lineEndA.y);
    context.stroke();

    context.beginPath();
    context.moveTo(lineStartB.x, lineStartB.y);
    context.lineTo(lineEndB.x, lineEndB.y);
    context.stroke();
  }

  context.restore();
}

function drawCube(
  originX,
  originY,
  tileWidth,
  tileHeight,
  cubeHeight,
  block,
  highlighted,
  pulseAmount,
) {
  const topNorth = projectPoint(
    originX,
    originY,
    tileWidth,
    tileHeight,
    cubeHeight,
    block.x,
    block.y,
    1,
  );
  const topEast = projectPoint(
    originX,
    originY,
    tileWidth,
    tileHeight,
    cubeHeight,
    block.x + 1,
    block.y,
    1,
  );
  const topSouth = projectPoint(
    originX,
    originY,
    tileWidth,
    tileHeight,
    cubeHeight,
    block.x + 1,
    block.y + 1,
    1,
  );
  const topWest = projectPoint(
    originX,
    originY,
    tileWidth,
    tileHeight,
    cubeHeight,
    block.x,
    block.y + 1,
    1,
  );

  const groundNorth = projectPoint(
    originX,
    originY,
    tileWidth,
    tileHeight,
    cubeHeight,
    block.x,
    block.y,
    0,
  );
  const groundEast = projectPoint(
    originX,
    originY,
    tileWidth,
    tileHeight,
    cubeHeight,
    block.x + 1,
    block.y,
    0,
  );
  const groundSouth = projectPoint(
    originX,
    originY,
    tileWidth,
    tileHeight,
    cubeHeight,
    block.x + 1,
    block.y + 1,
    0,
  );
  const groundWest = projectPoint(
    originX,
    originY,
    tileWidth,
    tileHeight,
    cubeHeight,
    block.x,
    block.y + 1,
    0,
  );

  const palette = isDarkTheme()
    ? highlighted
      ? {
          top: `rgba(134, 239, 172, ${0.86 + pulseAmount * 0.1})`,
          left: `rgba(74, 222, 128, ${0.88 + pulseAmount * 0.08})`,
          right: `rgba(34, 197, 94, ${0.9 + pulseAmount * 0.06})`,
          stroke: '#22c55e',
        }
      : {
          top: '#4ade80',
          left: '#22c55e',
          right: '#16a34a',
          stroke: '#15803d',
        }
    : highlighted
      ? {
          top: `rgba(122, 255, 120, ${0.86 + pulseAmount * 0.1})`,
          left: `rgba(63, 214, 74, ${0.88 + pulseAmount * 0.08})`,
          right: `rgba(42, 183, 54, ${0.9 + pulseAmount * 0.06})`,
          stroke: '#18882c',
        }
      : {
          top: '#57e46a',
          left: '#2ec741',
          right: '#20b134',
          stroke: '#208030',
        };

  fillPolygon(
    [topNorth, topEast, topSouth, topWest],
    palette.top,
    palette.stroke,
  );
  fillPolygon(
    [topWest, topSouth, groundSouth, groundWest],
    palette.left,
    palette.stroke,
  );
  fillPolygon(
    [topEast, topSouth, groundSouth, groundEast],
    palette.right,
    palette.stroke,
  );

  context.beginPath();
  context.moveTo(topNorth.x, topNorth.y);
  context.lineTo(groundNorth.x, groundNorth.y);
  context.strokeStyle = palette.stroke;
  context.stroke();
}

function getVisibleBlocks() {
  if (state.phase === 'guessing') {
    return [];
  }

  return state.blocks;
}

function getHeroValue() {
  if (state.phase === 'guessing') {
    return String(state.guess);
  }

  if (state.phase === 'revealing') {
    return String(state.revealIndex);
  }

  if (state.phase === 'result') {
    return String(state.blocks.length);
  }

  return '?';
}

function getTimerLabel(now) {
  if (state.phase === 'guessing') {
    return `${Math.max(0, (state.phaseEndsAt - now) / 1000).toFixed(1)}s`;
  }

  if (state.phase === 'showing') {
    return `${Math.max(0, (state.phaseEndsAt - now) / 1000).toFixed(1)}s`;
  }

  if (state.phase === 'result') {
    return `${Math.max(0, (state.phaseEndsAt - now) / 1000).toFixed(1)}s`;
  }

  return `${state.revealIndex}/${state.blocks.length}`;
}

function updateHud() {
  const now = performance.now();
  const guessing = state.phase === 'guessing';
  roundValue.textContent = String(state.round || 1);
  heroCount.textContent = getHeroValue();
  guessNumber.textContent = String(state.submittedGuess ?? state.guess);
  actualValue.textContent =
    state.phase === 'showing' || state.phase === 'guessing'
      ? '-'
      : String(state.blocks.length);
  timerValue.textContent = getTimerLabel(now);
  resultsPanel.dataset.result = state.result ?? '';
  incrementButton.disabled = !guessing;
  submitButton.disabled = !guessing;

  if (state.phase === 'showing') {
    phaseCopy.textContent = 'Memorize the pattern.';
  } else if (state.phase === 'guessing') {
    phaseCopy.textContent =
      'Press Space or tap Add Block. Press Enter or Check Now when ready.';
  } else if (state.phase === 'revealing') {
    phaseCopy.textContent = 'Counting the blocks back out loud.';
  } else {
    phaseCopy.textContent =
      state.result === 'correct'
        ? 'Exact match.'
        : 'Not quite. Watch the count.';
  }

  if (state.result === 'correct') {
    guessMark.textContent = '✓';
  } else if (state.result === 'incorrect') {
    guessMark.textContent = '✕';
  } else {
    guessMark.textContent = '';
  }
}

function incrementGuess() {
  if (state.phase !== 'guessing') {
    return;
  }

  state.guess += 1;
  updateHud();
}

function submitCurrentGuess() {
  if (state.phase !== 'guessing') {
    return;
  }

  clearTimers();
  submitGuess();
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawScene(now) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const tileWidth = Math.min(width * 0.16, height * 0.24, 74);
  const tileHeight = tileWidth / 2;
  const cubeHeight = tileHeight * 1.15;
  const originX = width / 2;
  const originY = height * 0.48;

  context.clearRect(0, 0, width, height);
  drawGrid(originX, originY, tileWidth, tileHeight);

  const visibleBlocks = getVisibleBlocks();
  const pulseAmount =
    1 - Math.min(1, (now - lastPulseAt) / config.revealStepMs);

  for (let index = 0; index < visibleBlocks.length; index += 1) {
    const block = visibleBlocks[index];
    const highlighted =
      state.phase === 'revealing' && index < state.revealIndex;
    drawCube(
      originX,
      originY,
      tileWidth,
      tileHeight,
      cubeHeight,
      block,
      highlighted,
      pulseAmount,
    );
  }
}

function render(now) {
  updateHud();
  drawScene(now);
  animationFrameId = window.requestAnimationFrame(render);
}

function handleKeyDown(event) {
  if (event.code === 'Space' || event.key === 'Enter') {
    ensureAudioContext();
  }

  if (state.phase !== 'guessing') {
    return;
  }

  if (event.code === 'Space') {
    event.preventDefault();
    incrementGuess();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    submitCurrentGuess();
  }
}

function handleControlPress(action) {
  ensureAudioContext();

  if (action === 'increment') {
    incrementGuess();
    return;
  }

  submitCurrentGuess();
}

function isDarkTheme() {
  return document.documentElement.classList.contains('dark');
}

function setTheme(dark) {
  const html = document.documentElement;
  html.classList.toggle('dark', dark);
  const btn = document.querySelector('#theme-toggle');
  if (btn) {
    const img = btn.querySelector('img');
    if (img) {
      img.src = dark ? sunIconUrl : moonIconUrl;
    }
    btn.setAttribute(
      'aria-label',
      dark ? 'Switch to light theme' : 'Switch to dark theme',
    );
  }
  localStorage.setItem('theme', dark ? 'dark' : 'light');
}

function initTheme() {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') {
    setTheme(stored === 'dark');
    return;
  }
  setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function setMuted(muted) {
  isMuted = muted;
  const btn = document.querySelector('#sound-toggle');
  if (btn) {
    const img = btn.querySelector('img');
    if (img) {
      img.src = muted ? mutedIconUrl : volumeIconUrl;
    }
    btn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }
  localStorage.setItem('sound', muted ? 'off' : 'on');
}

function initMute() {
  const stored = localStorage.getItem('sound');
  setMuted(stored === 'off');
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('keydown', handleKeyDown);
incrementButton.addEventListener('click', () =>
  handleControlPress('increment'),
);
submitButton.addEventListener('click', () => handleControlPress('submit'));
document.querySelector('#theme-toggle').addEventListener('click', () => {
  setTheme(!isDarkTheme());
});

document.querySelector('#sound-toggle').addEventListener('click', () => {
  setMuted(!isMuted);
});

initTheme();
initMute();
resizeCanvas();
startRound();
animationFrameId = window.requestAnimationFrame(render);

window.addEventListener('beforeunload', () => {
  clearTimers();
  window.cancelAnimationFrame(animationFrameId);
});
