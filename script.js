const board = document.getElementById('board');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const pauseBtn = document.getElementById('pause-btn');
const musicBtn = document.getElementById('music-btn');

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 20;

let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
let score = 0;
let lines = 0;
let level = 1;
let dropInterval = 1000;
let dropTimer;
let isPaused = false;
let lastMoveHardDrop = false;

// music setup: chiptune-style rendition of "Korobeiniki" (traditional Russian folk melody), lead + bass
let audioCtx;
let musicPlaying = false;
let musicTimeout;
let noteIndex = 0;
const beatMs = 180;

const melody = [
    ['E5',2],['B4',1],['C5',1],['D5',2],['C5',1],['B4',1],
    ['A4',2],['A4',1],['C5',1],['E5',2],['D5',1],['C5',1],
    ['B4',3],['C5',1],['D5',2],['E5',2],
    ['C5',2],['A4',2],['A4',2],['A4',2],
    ['D5',2],['F5',1],['A5',2],['G5',1],['F5',1],
    ['E5',3],['C5',1],['E5',2],['D5',1],['C5',1],
    ['B4',2],['B4',1],['C5',1],['D5',2],['E5',2],
    ['C5',2],['A4',2],['A4',2]
];

const bassline = [
    ['A2',4],['E2',4],['A2',4],['E2',4],
    ['A2',4],['E2',4],['A2',4],['E2',4],
    ['D2',4],['A2',4],['D2',4],['A2',4],
    ['E2',4],['B1',4],['E2',4],['A2',4]
];

function noteToFreq(note) {
    const semitoneMap = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
    const match = note.match(/^([A-G]#?)(\d)$/);
    const [, pitch, octave] = match;
    const semitone = semitoneMap[pitch] + (parseInt(octave, 10) - 4) * 12;
    return 440 * Math.pow(2, semitone / 12);
}

function playTone(freq, durationSec, type, volume) {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    // envelope avoids clicks and gives a softer, more musical tone
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationSec);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + durationSec + 0.05);
}

const tetrominoes = {
    I: [
        [[0,0],[1,0],[2,0],[3,0]],
        [[2,-1],[2,0],[2,1],[2,2]],
        [[0,1],[1,1],[2,1],[3,1]],
        [[1,-1],[1,0],[1,1],[1,2]]
    ],
    J: [
        [[0,0],[0,1],[1,1],[2,1]],
        [[1,0],[2,0],[1,1],[1,2]],
        [[0,1],[1,1],[2,1],[2,2]],
        [[1,0],[1,1],[1,2],[0,2]]
    ],
    L: [
        [[2,0],[0,1],[1,1],[2,1]],
        [[1,0],[1,1],[1,2],[2,2]],
        [[0,1],[1,1],[2,1],[0,2]],
        [[0,0],[1,0],[1,1],[1,2]]
    ],
    O: [
        [[1,0],[2,0],[1,1],[2,1]],
        [[1,0],[2,0],[1,1],[2,1]],
        [[1,0],[2,0],[1,1],[2,1]],
        [[1,0],[2,0],[1,1],[2,1]]
    ],
    S: [
        [[1,0],[2,0],[0,1],[1,1]],
        [[1,0],[1,1],[2,1],[2,2]],
        [[1,1],[2,1],[0,2],[1,2]],
        [[0,0],[0,1],[1,1],[1,2]]
    ],
    T: [
        [[1,0],[0,1],[1,1],[2,1]],
        [[1,0],[1,1],[2,1],[1,2]],
        [[0,1],[1,1],[2,1],[1,2]],
        [[1,0],[0,1],[1,1],[1,2]]
    ],
    Z: [
        [[0,0],[1,0],[1,1],[2,1]],
        [[2,0],[1,1],[2,1],[1,2]],
        [[0,1],[1,1],[1,2],[2,2]],
        [[1,0],[0,1],[1,1],[0,2]]
    ]
};

const colors = {
    I: '#00f0f0',
    J: '#0040ff',
    L: '#ff7f00',
    O: '#ffef00',
    S: '#00ff00',
    T: '#af00ff',
    Z: '#ff0000'
};

// lighten/darken a #rrggbb color by a percentage, used for beveled block shading
function shadeColor(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    const amt = Math.round(2.55 * percent);
    let r = Math.min(255, Math.max(0, (num >> 16) + amt));
    let g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
    let b = Math.min(255, Math.max(0, (num & 0xff) + amt));
    return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

// gives filled cells a glossy, beveled look instead of a flat fill
function styleFilledCell(cell, color) {
    cell.style.background = `linear-gradient(135deg, ${shadeColor(color, 35)}, ${color} 55%, ${shadeColor(color, -30)})`;
    cell.style.boxShadow = 'inset 2px 2px 2px rgba(255,255,255,0.5), inset -2px -2px 3px rgba(0,0,0,0.5)';
    cell.style.border = '1px solid rgba(0,0,0,0.4)';
    cell.style.borderRadius = '2px';
}

let currentPiece;
let currentX = 3;
let currentY = 0;
let rotation = 0;

function drawBoard() {
    board.innerHTML = '';
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            if (grid[y][x]) {
                styleFilledCell(cell, grid[y][x]);
            }
            board.appendChild(cell);
        }
    }
}

function randomPiece() {
    const keys = Object.keys(tetrominoes);
    const key = keys[Math.floor(Math.random() * keys.length)];
    return { shape: tetrominoes[key], color: colors[key], key };
}

function canMove(offsetX, offsetY, newRotation) {
    const shape = currentPiece.shape[newRotation];
    return shape.every(([x,y]) => {
        const newX = currentX + x + offsetX;
        const newY = currentY + y + offsetY;
        if (newX < 0 || newX >= COLS || newY >= ROWS) return false;
        if (newY >= 0 && grid[newY][newX]) return false;
        return true;
    });
}

function placePiece() {
    currentPiece.shape[rotation].forEach(([x,y]) => {
        const boardX = currentX + x;
        const boardY = currentY + y;
        if (boardY >= 0) {
            grid[boardY][boardX] = currentPiece.color;
        }
    });
}

function removeFullLines() {
    const rowsToClear = [];
    const rowData = [];
    for (let y = 0; y < ROWS; y++) {
        if (grid[y].every(cell => cell)) {
            rowsToClear.push(y);
            rowData.push({ index: y, cells: [...grid[y]] });
        }
    }
    if (rowsToClear.length === 0) return [];
    rowsToClear.sort((a, b) => a - b);
    for (let i = rowsToClear.length - 1; i >= 0; i--) {
        grid.splice(rowsToClear[i], 1);
    }
    while (grid.length < ROWS) {
        grid.unshift(Array(COLS).fill(0));
    }
    score += rowsToClear.length * 100;
    lines += rowsToClear.length;
    level = 1 + Math.floor(lines / 10);
    dropInterval = 1000 - (level - 1) * 100;
    clearInterval(dropTimer);
    dropTimer = setInterval(tick, dropInterval);
    updateScore();
    return rowData;
}

function showLineBreakEffect(rows) {
    rows.forEach(row => {
        const effect = document.createElement('div');
        effect.classList.add('row-effect');
        effect.style.top = `${row.index * BLOCK_SIZE}px`;
        for (let x = 0; x < COLS; x++) {
            const frag = document.createElement('div');
            frag.classList.add('fragment');
            frag.style.backgroundColor = row.cells[x] || '#555';
            effect.appendChild(frag);
        }
        board.appendChild(effect);
        setTimeout(() => board.removeChild(effect), 400);
    });
}

function updateScore() {
    scoreEl.textContent = `Score: ${score}`;
    linesEl.textContent = `Lines: ${lines}`;
    levelEl.textContent = `Level: ${level}`;
}

function drawPiece() {
    currentPiece.shape[rotation].forEach(([x,y]) => {
        const boardX = currentX + x;
        const boardY = currentY + y;
        if (boardY >= 0) {
            const index = boardY * COLS + boardX;
            const cell = board.children[index];
            styleFilledCell(cell, currentPiece.color);
        }
    });
}

function spawnPiece() {
    currentPiece = randomPiece();
    currentX = 3;
    currentY = -1;
    rotation = 0;
    if (!canMove(0, 1, rotation)) {
        alert('Game Over!');
        clearInterval(dropTimer);
    }
}

function tick() {
    if (isPaused) return;
    if (canMove(0, 1, rotation)) {
        currentY++;
    } else {
        placePiece();
        removeFullLines();
        spawnPiece();
    }
    drawBoard();
    drawPiece();
}

function startGame() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 1000;
    updateScore();
    spawnPiece();
    drawBoard();
    dropTimer = setInterval(tick, dropInterval);
}

function moveLeft() {
    if (canMove(-1, 0, rotation)) currentX--;
}
function moveRight() {
    if (canMove(1, 0, rotation)) currentX++;
}
function rotate() {
    const newRotation = (rotation + 1) % 4;
    if (canMove(0, 0, newRotation)) rotation = newRotation;
}
function softDrop() {
    if (canMove(0, 1, rotation)) {
        currentY++;
    } else {
        placePiece();
        removeFullLines();
        spawnPiece();
    }
}
function hardDrop() {
    lastMoveHardDrop = true;
    while (canMove(0,1,rotation)) {
        currentY++;
    }
    placePiece();
    const cleared = removeFullLines();
    lastMoveHardDrop = false;
    spawnPiece();
    drawBoard();
    drawPiece();
    if (cleared.length > 0) {
        showLineBreakEffect(cleared);
    }
}
function togglePause() {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
}

function scheduleNextNote() {
    if (!musicPlaying) return;
    const [leadNote, leadBeats] = melody[noteIndex % melody.length];
    const durSec = (leadBeats * beatMs) / 1000;
    playTone(noteToFreq(leadNote), durSec * 0.9, 'square', 0.12);

    const bassStep = bassline[noteIndex % bassline.length];
    if (bassStep) {
        const [bassNote, bassBeats] = bassStep;
        playTone(noteToFreq(bassNote), (bassBeats * beatMs) / 1000 * 0.9, 'triangle', 0.09);
    }

    noteIndex++;
    musicTimeout = setTimeout(scheduleNextNote, durSec * 1000);
}

function startMusic() {
    if (musicPlaying) return;
    musicPlaying = true;
    noteIndex = 0;
    scheduleNextNote();
}

function stopMusic() {
    musicPlaying = false;
    clearTimeout(musicTimeout);
}

document.addEventListener('keydown', (e) => {
    if (isPaused) return;
    switch(e.key) {
        case 'ArrowLeft':
            moveLeft();
            break;
        case 'ArrowRight':
            moveRight();
            break;
        case 'ArrowUp':
            rotate();
            break;
        case 'ArrowDown':
            softDrop();
            break;
        case ' ': // Space
            hardDrop();
            return;
        case 'p':
        case 'P':
            togglePause();
            return;
        default:
            return;
    }
    drawBoard();
    drawPiece();
});

pauseBtn.addEventListener('click', togglePause);
musicBtn.addEventListener('click', () => {
    if (musicPlaying) {
        stopMusic();
        musicBtn.textContent = 'Music On';
    } else {
        startMusic();
        musicBtn.textContent = 'Music Off';
    }
});

startGame();
