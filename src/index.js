import './index.css';

const config = {
  gridSize: 5,
  showDurationMs: 2_600,
  revealStepMs: 550,
  resultDurationMs: 1_900,
  minBlocks: 2,
  maxBlocks: 10,
};

const canvas = document.querySelector('#game-canvas');
const context = canvas.getContext('2d');
const heroCount = document.querySelector('#hero-count');
const roundValue = document.querySelector('#round-value');

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
  updateHud();
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

function strokeSegment(start, end, strokeStyle) {
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.strokeStyle = strokeStyle;
  context.stroke();
}

function pulseLightness(base, pulseAmount) {
  return Math.round(base + pulseAmount * 8);
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
          top: `hsl(138 79% ${pulseLightness(73, pulseAmount)}%)`,
          left: `hsl(137 69% ${pulseLightness(58, pulseAmount)}%)`,
          right: `hsl(142 72% ${pulseLightness(45, pulseAmount)}%)`,
          stroke: '#22c55e',
        }
      : {
          top: '#f8fafc',
          left: '#e2e8f0',
          right: '#cbd5e1',
          stroke: '#94a3b8',
        }
    : highlighted
      ? {
          top: `hsl(120 100% ${pulseLightness(74, pulseAmount)}%)`,
          left: `hsl(124 66% ${pulseLightness(54, pulseAmount)}%)`,
          right: `hsl(125 63% ${pulseLightness(44, pulseAmount)}%)`,
          stroke: '#18882c',
        }
      : {
          top: '#ffffff',
          left: '#f3f4f6',
          right: '#e5e7eb',
          stroke: '#9ca3af',
        };

  drawPath([topNorth, topEast, topSouth, topWest]);
  context.fillStyle = palette.top;
  context.fill();

  drawPath([topWest, topSouth, groundSouth, groundWest]);
  context.fillStyle = palette.left;
  context.fill();

  drawPath([topEast, topSouth, groundSouth, groundEast]);
  context.fillStyle = palette.right;
  context.fill();

  strokeSegment(topNorth, topEast, palette.stroke);
  strokeSegment(topEast, groundEast, palette.stroke);
  strokeSegment(topEast, topSouth, palette.stroke);
  strokeSegment(groundEast, groundSouth, palette.stroke);
  strokeSegment(topSouth, groundSouth, palette.stroke);
  strokeSegment(groundSouth, groundWest, palette.stroke);
  strokeSegment(groundWest, topWest, palette.stroke);
  strokeSegment(topWest, topNorth, palette.stroke);
  strokeSegment(topWest, topSouth, palette.stroke);
  strokeSegment(topEast, topSouth, palette.stroke);
}

function getVisibleBlocks() {
  if (state.phase === 'guessing') {
    return [];
  }

  return state.blocks;
}

function getHeroValue(now) {
  if (state.phase === 'guessing') {
    return '';
  }

  if (state.phase === 'showing' || state.phase === 'result') {
    return `${Math.ceil(Math.max(0, state.phaseEndsAt - now) / 1000)}`;
  }

  if (state.phase === 'revealing') {
    return String(state.revealIndex);
  }

  return '?';
}

function updateHud() {
  const now = performance.now();
  const guessing = state.phase === 'guessing';
  roundValue.textContent = String(state.round || 1);
  heroCount.textContent = getHeroValue(now);
  guessNumber.textContent = String(state.submittedGuess ?? state.guess);
  actualValue.textContent =
    state.phase === 'showing' || state.phase === 'guessing'
      ? '-'
      : String(state.blocks.length);

  resultsPanel.dataset.result = state.result ?? '';
  incrementButton.disabled = !guessing;
  submitButton.disabled = !guessing;

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
  const tileWidth = Math.min(
    width / (config.gridSize + 2),
    height / (config.gridSize + 2.5),
    96,
  );
  const tileHeight = tileWidth / 2;
  const cubeHeight = tileHeight * 1.15;
  const originX = width / 2;
  const contentHeight = config.gridSize * tileHeight + cubeHeight;
  const originY = (height - contentHeight) / 2 + cubeHeight;

  context.clearRect(0, 0, width, height);
  drawGrid(originX, originY, tileWidth, tileHeight);

  const visibleBlocks = getVisibleBlocks();
  const pulseAmount =
    1 - Math.min(1, (now - lastPulseAt) / config.revealStepMs);

  for (let index = 0; index < visibleBlocks.length; index += 1) {
    const block = visibleBlocks[index];
    const highlighted =
      (state.phase === 'revealing' || state.phase === 'result') &&
      index < state.revealIndex;
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
      img.src = dark ? '/icons/sun.svg' : '/icons/moon.svg';
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
      img.src = muted ? '/icons/muted.svg' : '/icons/volume.svg';
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
