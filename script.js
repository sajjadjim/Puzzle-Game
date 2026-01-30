// --- AUDIO SYSTEM ---
const AudioEngine = {
    ctx: new (window.AudioContext || window.webkitAudioContext)(),
    playTone(freq, type, duration) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    snap() { this.playTone(800, 'sine', 0.1); },
    win() { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this.playTone(f, 'sine', 0.6), i * 100)); }
};

// --- GAME STATE ---
const State = {
    img: null,
    cols: 5, rows: 5,
    pieces: [],
    pieceWidth: 0, pieceHeight: 0,
    completed: 0, totalPieces: 0,
    moves: 0,
    startTime: null, timerInterval: null
};

const Config = {
    snapThreshold: 25,
    // Increased buffer size to ensure tabs don't get cut off
    bufferRatio: 0.45
};

const D = {
    board: document.getElementById('game-board'),
    pool: document.getElementById('piece-pool'),
    wrapper: document.getElementById('board-wrapper'),
    guide: document.getElementById('guide-image'),
    timer: document.getElementById('timer'),
    moves: document.getElementById('move-count'),
    pct: document.getElementById('progress-pct'),
    progBar: document.getElementById('top-progress'),
    modal: document.getElementById('win-modal'),
    upload: document.getElementById('img-upload'),
    difficulty: document.getElementById('difficulty'),
    btnGuide: document.getElementById('btn-guide'),
    btnShuffle: document.getElementById('btn-shuffle')
};

// --- INIT ---
const defaultImg = new Image();
defaultImg.src = 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1000&q=80';
defaultImg.onload = () => { State.img = defaultImg; initGame(); };

D.upload.addEventListener('change', handleUpload);
D.difficulty.addEventListener('change', initGame);
D.btnShuffle.addEventListener('click', initGame);
D.btnGuide.addEventListener('click', () => D.guide.style.opacity = D.guide.style.opacity === '0.8' ? '0.1' : '0.8');

function handleUpload(e) {
    if (!e.target.files[0]) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => { State.img = img; initGame(); }
        img.src = evt.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
}

function initGame() {
    stopTimer();
    D.modal.classList.remove('active');
    D.board.innerHTML = '';
    D.pool.innerHTML = '';
    D.board.appendChild(D.guide);

    State.cols = parseInt(D.difficulty.value);
    State.rows = parseInt(D.difficulty.value);
    State.moves = 0;
    State.completed = 0;
    State.totalPieces = State.cols * State.rows;
    updateStats();

    // 1. Calculate Board Dimensions
    const maxW = D.wrapper.clientWidth - 40;
    const maxH = D.wrapper.clientHeight - 40;
    const scale = Math.min(maxW / State.img.width, maxH / State.img.height);
    const boardW = State.img.width * scale;
    const boardH = State.img.height * scale;

    D.board.style.width = `${boardW}px`;
    D.board.style.height = `${boardH}px`;

    State.pieceWidth = boardW / State.cols;
    State.pieceHeight = boardH / State.rows;

    // 2. Draw Guide Image
    D.guide.width = boardW;
    D.guide.height = boardH;
    const ctx = D.guide.getContext('2d');

    // Draw the main image
    ctx.drawImage(State.img, 0, 0, boardW, boardH);

    // --- NEW: DRAW GRID LINES ---
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // Faint white lines
    ctx.lineWidth = 1;

    // Draw Vertical Lines
    for (let x = 1; x < State.cols; x++) {
        const xPos = x * State.pieceWidth;
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, boardH);
    }

    // Draw Horizontal Lines
    for (let y = 1; y < State.rows; y++) {
        const yPos = y * State.pieceHeight;
        ctx.moveTo(0, yPos);
        ctx.lineTo(boardW, yPos);
    }
    ctx.stroke();
    // ---------------------------

    generatePieces(boardW, boardH, scale);
    startTimer();
}
// --- UPDATED PIECE GENERATION ---
function generatePieces(totalW, totalH, imgScale) {
    const shapes = [];
    // Generate connection map
    for (let y = 0; y < State.rows; y++) {
        const row = [];
        for (let x = 0; x < State.cols; x++) {
            row.push({
                top: y === 0 ? 0 : -shapes[y - 1][x].bottom,
                right: x === State.cols - 1 ? 0 : (Math.random() > 0.5 ? 1 : -1),
                bottom: y === State.rows - 1 ? 0 : (Math.random() > 0.5 ? 1 : -1),
                left: x === 0 ? 0 : -row[x - 1].right
            });
        }
        shapes.push(row);
    }

    // Render Pieces
    for (let y = 0; y < State.rows; y++) {
        for (let x = 0; x < State.cols; x++) {
            createPieceCanvas(x, y, shapes[y][x], imgScale);
        }
    }

    // Visual Shuffle
    const pieces = Array.from(D.pool.children);
    pieces.sort(() => Math.random() - 0.5);
    pieces.forEach(p => D.pool.appendChild(p));
}

function createPieceCanvas(col, row, shape, scale) {
    const cnvs = document.createElement('canvas');
    const ctx = cnvs.getContext('2d');

    const pW = State.pieceWidth;
    const pH = State.pieceHeight;
    // Buffer must be large enough to hold the "out" tabs
    const buffer = Math.max(pW, pH) * Config.bufferRatio;

    cnvs.width = pW + buffer * 2;
    cnvs.height = pH + buffer * 2;

    ctx.translate(buffer, buffer);

    // Draw the path
    drawPath(ctx, pW, pH, shape);

    // Clip and Draw Image
    ctx.save();
    ctx.clip();

    const srcX = (col * pW) / scale;
    const srcY = (row * pH) / scale;
    const srcW = pW / scale;
    const srcH = pH / scale;
    const srcBuff = buffer / scale;

    ctx.drawImage(State.img,
        srcX - srcBuff, srcY - srcBuff,
        srcW + srcBuff * 2, srcH + srcBuff * 2,
        -buffer, -buffer, cnvs.width, cnvs.height
    );
    ctx.restore();

    // High quality borders
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const div = document.createElement('div');
    div.className = 'puzzle-piece in-pool';
    div.style.width = `${cnvs.width}px`;
    div.style.height = `${cnvs.height}px`;
    div.style.backgroundImage = `url(${cnvs.toDataURL()})`;

    div.dataset.tx = col * pW - buffer;
    div.dataset.ty = row * pH - buffer;

    setupDrag(div);
    D.pool.appendChild(div);
}

// --- KEY FIX: ROBUST PATH LOGIC ---
function drawPath(ctx, w, h, s) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    renderEdge(ctx, w, s.top);          // Top (0 deg)
    renderEdge(ctx, h, s.right, w, 0, 90);  // Right (90 deg)
    renderEdge(ctx, w, s.bottom, w, h, 180); // Bottom (180 deg)
    renderEdge(ctx, h, s.left, 0, h, 270);   // Left (270 deg)
    ctx.closePath();
}

// Uses a standard Jigsaw shape with 3 Bezier curves per tab
function renderEdge(ctx, len, type, dx = 0, dy = 0, rot = 0) {
    // If flat edge
    if (type === 0) {
        const rad = rot * Math.PI / 180;
        ctx.lineTo(dx + len * Math.cos(rad), dy + len * Math.sin(rad));
        return;
    }

    // Configuration for the Tab shape
    // We define the shape relative to a horizontal line from (0,0) to (len,0)
    // type 1 = bump out (negative Y), type -1 = bump in (positive Y)

    const rad = rot * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Helper to transform local (x,y) to global context based on rotation/position
    const t = (x, y) => ({
        x: dx + (x * cos - y * sin),
        y: dy + (x * sin + y * cos)
    });

    // SHAPE DEFINITION (Classic Jigsaw Tab)
    const neckW = len * 0.2;        // Width of the neck base
    const headW = len * 0.35;       // Width of the head (widest point)
    const tabH = len * 0.25 * type; // Height (direction based on type)
    const vary = 0.05 * len;        // Curve variance for smoothness

    // 1. Line to Neck Start
    const x1 = (len - neckW) / 2;     // approx 35%
    const x2 = (len + neckW) / 2;     // approx 65%

    const p1 = t(x1, 0);
    ctx.lineTo(p1.x, p1.y);

    // 2. Curve: Neck Start -> Head Top Left
    // Control Points for "Shoulder"
    const cp1 = t(x1, -tabH * 0.2); // slight bump up
    const cp2 = t(x1 - vary, -tabH); // wide out
    const p2 = t(len / 2 - headW / 2, -tabH); // Top Left of head
    // Note: We use a simplified single cubic bezier for the left side of the tab
    // To make it look like a puzzle piece, it needs to curve In then Out.
    // Let's use a 3-part curve for high fidelity.

    // Left Side of Tab
    const b1 = t(x1, 0);
    const b2 = t(x1 - vary, -tabH / 2);
    const b3 = t(len / 2 - headW / 2, -tabH);

    // Instead of calculating complex CPs, let's use a fixed relative path for a "perfect" shape
    // Coordinates for a standard tab (0 to 1 scale), scaled by len and tabH

    // Base -> Neck Start
    // Neck Start -> Head Top
    ctx.bezierCurveTo(
        t(x1, -tabH * 0.5).x, t(x1, -tabH * 0.5).y, // CP1: Pull up
        t(len / 2 - headW / 1.5, -tabH).x, t(len / 2 - headW / 1.5, -tabH).y, // CP2: Pull wide
        t(len / 2, -tabH).x, t(len / 2, -tabH).y // End: Center Top
    );

    // Head Top -> Neck End
    ctx.bezierCurveTo(
        t(len / 2 + headW / 1.5, -tabH).x, t(len / 2 + headW / 1.5, -tabH).y, // CP1
        t(x2, -tabH * 0.5).x, t(x2, -tabH * 0.5).y, // CP2
        t(x2, 0).x, t(x2, 0).y // End: Base
    );

    // 3. Line to End
    const end = t(len, 0);
    ctx.lineTo(end.x, end.y);
}

// --- INTERACTION ---
function setupDrag(el) {
    el.addEventListener('mousedown', startDrag);
    el.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
        if (el.classList.contains('snapped')) return;
        e.preventDefault();

        // Move from pool to board
        if (el.classList.contains('in-pool')) {
            const rect = el.getBoundingClientRect();
            const boardRect = D.board.getBoundingClientRect();
            el.classList.remove('in-pool');
            D.board.appendChild(el);
            const x = (e.clientX || e.touches[0].clientX) - boardRect.left - el.offsetWidth / 2;
            const y = (e.clientY || e.touches[0].clientY) - boardRect.top - el.offsetHeight / 2;
            el.style.left = x + 'px'; el.style.top = y + 'px';
        }

        State.isDragging = true;
        el.style.zIndex = 100;
        const cx = e.clientX || e.touches[0].clientX;
        const cy = e.clientY || e.touches[0].clientY;
        const startL = el.offsetLeft;
        const startT = el.offsetTop;

        function onMove(ev) {
            const nx = ev.clientX || ev.touches[0].clientX;
            const ny = ev.clientY || ev.touches[0].clientY;
            el.style.left = (startL + nx - cx) + 'px';
            el.style.top = (startT + ny - cy) + 'px';
        }

        function onEnd() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            State.isDragging = false;
            el.style.zIndex = '';
            State.moves++;
            updateStats();
            checkSnap(el);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
    }
}

function checkSnap(el) {
    const tx = parseFloat(el.dataset.tx);
    const ty = parseFloat(el.dataset.ty);
    const dist = Math.hypot(el.offsetLeft - tx, el.offsetTop - ty);

    if (dist < Config.snapThreshold) {
        el.style.left = tx + 'px';
        el.style.top = ty + 'px';
        el.classList.add('snapped');
        const clone = el.cloneNode(true);
        D.board.replaceChild(clone, el);
        AudioEngine.snap();
        State.completed++;
        updateStats();
        if (State.completed === State.totalPieces) gameWin();
    }
}

// --- UTILS ---
function startTimer() {
    State.startTime = Date.now();
    State.timerInterval = setInterval(() => {
        const d = Math.floor((Date.now() - State.startTime) / 1000);
        D.timer.innerText = `${Math.floor(d / 60).toString().padStart(2, '0')}:${(d % 60).toString().padStart(2, '0')}`;
    }, 1000);
}
function stopTimer() { clearInterval(State.timerInterval); D.timer.innerText = "00:00"; }
function updateStats() {
    D.moves.innerText = State.moves;
    const pct = Math.floor((State.completed / State.totalPieces) * 100);
    D.pct.innerText = `${pct}%`;
    D.progBar.style.width = `${pct}%`;
}
function gameWin() {
    clearInterval(State.timerInterval);
    AudioEngine.win();

    // --- STEP 1: CLEAN UP VISUALS ---

    // 1. Clear the canvas (removes grid lines) and redraw the pristine image
    const ctx = D.guide.getContext('2d');
    ctx.clearRect(0, 0, D.guide.width, D.guide.height);
    ctx.globalAlpha = 1.0; // Ensure full opacity
    ctx.drawImage(State.img, 0, 0, D.guide.width, D.guide.height);

    // 2. Set canvas to full visibility via CSS
    D.guide.style.transition = "opacity 0.5s ease";
    D.guide.style.opacity = "1";
    D.guide.style.filter = "brightness(1.1)"; // Slight glow effect

    // 3. Fade out the individual puzzle pieces (hides the borders/cracks)
    // We use a timeout to let the canvas redraw first, preventing a flicker
    const pieces = document.querySelectorAll('.puzzle-piece');
    pieces.forEach(p => {
        p.style.transition = "opacity 0.5s";
        p.style.opacity = "0";
        // Remove them from DOM after fade to save memory
        setTimeout(() => p.remove(), 500);
    });

    // --- STEP 2: SHOW STATISTICS & CELEBRATION ---

    document.getElementById('final-stats').innerHTML =
        `Time: <b>${D.timer.innerText}</b> <br> Moves: <b>${State.moves}</b>`;

    // Delay the modal slightly so the user sees the beautiful full image first
    setTimeout(() => {
        D.modal.classList.add('active');
        fireConfetti();
    }, 800);
}
function fireConfetti() { /* Same as before */
    const cvs = document.getElementById('confetti-canvas'), ctx = cvs.getContext('2d');
    cvs.width = innerWidth; cvs.height = innerHeight;
    const p = []; const c = ['#f00', '#0f0', '#00f', '#ff0', '#0ff'];
    for (let i = 0; i < 100; i++) p.push({ x: cvs.width / 2, y: cvs.height / 2, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, c: c[Math.floor(Math.random() * c.length)], l: 100 });
    (function d() {
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        p.forEach((k, i) => { k.x += k.vx; k.y += k.vy; k.vy += 0.5; k.l *= 0.95; ctx.fillStyle = k.c; ctx.beginPath(); ctx.arc(k.x, k.y, 5, 0, Math.PI * 2); ctx.fill(); if (k.l < 1) p.splice(i, 1) });
        if (p.length) requestAnimationFrame(d);
    })();
}
