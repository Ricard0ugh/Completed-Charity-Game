// Log a message to the console to ensure the script is linked correctly
console.log('JavaScript file is linked correctly.');

// Get DOM elements
const startBtn = document.getElementById('start-btn');
const titleScreen = document.getElementById('title-screen');
const gameEl = document.getElementById('game');
const enemyWordEl = document.getElementById('enemy-word');
const enemyBox = document.getElementById('enemy-box');
const inputEl = document.getElementById('word-input');
const scoreEl = document.getElementById('score');
const healthEl = document.getElementById('health');
const feedbackEl = document.getElementById('feedback');
const roomEl = document.getElementById('room');
const countdownEl = document.getElementById('countdown');
const obstacleNote = document.getElementById('obstacle-note');
const homeBtn = document.getElementById('home-btn');

// Game variables
let score = 0;
let health = 3;
let room = 1;
const totalRooms = 5;
let currentWord = '';
let timeoutId = null;
let countdownId = null;
// time per room is adjustable by difficulty
let timePerRoom = 9; // seconds (default medium)
// track whether the first enemy/timer has started
let gameStarted = false;
// current difficulty: 'easy' | 'medium' | 'hard'
let difficulty = 'medium';

// Word pools per difficulty
const wordsEasy = [
    'well','cup','tap','well','flow','drink','help','share','team','seed'
];
const wordsMedium = [
    'water','river','hope','clean','spring','bottle','pipe','journey','village','build',
    'health','vital','thirst','save','heart','plant','grow','light','access','pump'
];
const wordsHard = [
    'community','sustain','repair','donate','project','filter','source','sanitation','infrastructure','hydration'
];

// Obstacle words and settings
const obstacleWords = [
    'trap','curse','quicksand','spike','poison','snare','sludge','collapse','ambush','thorn'
];
const obstaclePenalty = 5; // points lost when obstacle is missed

// obstacle spawn probability per difficulty
const obstacleProb = {
    easy: 0.05,
    medium: 0.12,
    hard: 0.22
};

// track whether current word is an obstacle
let currentIsObstacle = false;

// Utility: pick a random word from the pool for the current difficulty
function pickWord() {
    let pool = wordsMedium;
    if (difficulty === 'easy') pool = wordsEasy;
    else if (difficulty === 'hard') pool = wordsHard;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
}

// Update HUD: score, health, room
function updateHUD() {
    scoreEl.innerText = `Score: ${score}`;
    roomEl.innerText = `Room: ${room}`;
    // render hearts
    healthEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart' + (i < health ? '' : ' empty');
        healthEl.appendChild(heart);
    }
}

// Show feedback message briefly
function showFeedback(text, good) {
    feedbackEl.innerText = text;
    feedbackEl.style.color = good ? 'green' : 'crimson';
    // flash enemy box
    enemyBox.classList.add(good ? 'flash-good' : 'flash-bad');
    setTimeout(() => {
        enemyBox.classList.remove('flash-good', 'flash-bad');
    }, 550);
    // clear feedback after a short time
    setTimeout(() => {
        if (feedbackEl.innerText === text) feedbackEl.innerText = '';
    }, 900);
}

// Start per-room countdown and timeout
function startTimer() {
    let timeLeft = timePerRoom;
    countdownEl.innerText = `Time: ${timeLeft}s`;
    // clear previous timers
    clearInterval(countdownId);
    clearTimeout(timeoutId);

    countdownId = setInterval(() => {
        timeLeft -= 1;
        countdownEl.innerText = `Time: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(countdownId);
        }
    }, 1000);

    timeoutId = setTimeout(() => {
        // player timed out
        handleMiss('Missed! Time ran out.');
    }, timePerRoom * 1000);
}

// Load a new enemy word for the current room
// loadEnemy(startNow = true):
// - if startNow is true (default), clear input, focus and start the timer
// - if startNow is false, only display the word and update HUD (no timer)
// - may spawn an obstacle instead of a normal enemy based on obstacleProb[difficulty]
function loadEnemy(startNow = true) {
    // decide if this spawn is an obstacle
    currentIsObstacle = Math.random() < (obstacleProb[difficulty] || 0);
    if (currentIsObstacle) {
        // pick an obstacle word
        const idx = Math.floor(Math.random() * obstacleWords.length);
        currentWord = obstacleWords[idx];
        // visually mark obstacle
        enemyBox.classList.add('obstacle');
        // show in-game advisory about red words
        if (obstacleNote) obstacleNote.classList.remove('hidden');
    } else {
        // normal enemy
        currentWord = pickWord();
        enemyBox.classList.remove('obstacle');
        if (obstacleNote) obstacleNote.classList.add('hidden');
    }

    enemyWordEl.innerText = currentWord;
    updateHUD();
    if (startNow) {
        inputEl.value = '';
        inputEl.focus();
        startTimer();
    }
}

// Handle correct typing
function handleCorrect() {
    clearTimeout(timeoutId);
    clearInterval(countdownId);
    score += 10;
    showFeedback('Correct!', true);
    // advance to next room
    room += 1;
    updateHUD();

    // Check win condition
    if (room > totalRooms) {
        // player won
        setTimeout(() => showEndScreen(true), 700);
        return;
    }

    // load next enemy after short delay
    setTimeout(() => {
        loadEnemy();
    }, 600);
}

// Handle miss (wrong word or timeout)
function handleMiss(message = 'Miss!') {
    clearTimeout(timeoutId);
    clearInterval(countdownId);

    // decrement health as before
    health -= 1;
    // if current word was an obstacle, additionally deduct score
    if (currentIsObstacle) {
        const prevScore = score;
        score = Math.max(0, score - obstaclePenalty);
        showFeedback(`${message} Obstacle! -${prevScore - score} score`, false);
    } else {
        showFeedback(message, false);
    }

    updateHUD();

    if (health <= 0) {
        // game over
        setTimeout(() => showEndScreen(false), 600);
        return;
    }

    // clear obstacle visual when moving on
    currentIsObstacle = false;
    enemyBox.classList.remove('obstacle');

    // load next enemy after short delay
    setTimeout(() => {
        loadEnemy();
    }, 700);
}

// Show end screen (win or lose)
// replaced modal overlay logic with brief in-page feedback then return to title
function showEndScreen(win) {
    // stop any timers to avoid surprises
    clearTimeout(timeoutId);
    clearInterval(countdownId);
    // disable input so player can't continue typing after end
    if (inputEl) inputEl.disabled = true;

    if (win) {
        // short in-page message
        showFeedback('You helped bring clean water! Victory!', true);
        // celebrate with confetti (library wrapper) if available
        if (typeof launchConfetti === 'function') launchConfetti(48);
        // reveal Return Home button so user can choose when to go back
        if (homeBtn) {
            homeBtn.classList.remove('hidden');
            homeBtn.focus();
        }
        // do NOT auto-reset — wait for the player's action
    } else {
        showFeedback('Game Over — you ran out of hearts.', false);
        // after a short pause return to the title screen so player can restart
        setTimeout(() => {
            resetToTitle();
        }, 1400);
    }
}

// Reset game to title screen
function resetToTitle() {
    // clear timers
    clearTimeout(timeoutId);
    clearInterval(countdownId);
    // reset variables
    score = 0;
    health = 3;
    room = 1;
    currentWord = '';
    gameStarted = false;
    currentIsObstacle = false;
    updateHUD();
    feedbackEl.innerText = '';
    enemyWordEl.innerText = '--';
    countdownEl.innerText = '--';

    // ensure input is fully cleared and not focused so previous text can't persist
    if (inputEl) {
        inputEl.value = '';
        inputEl.blur();
        inputEl.disabled = false;
    }

    // remove obstacle visual if present
    enemyBox.classList.remove('obstacle');
    if (obstacleNote) obstacleNote.classList.add('hidden');
    // hide home button after returning to title
    if (homeBtn) homeBtn.classList.add('hidden');

    // show title - ensure display restored
    gameEl.classList.add('hidden');
    titleScreen.classList.remove('hidden');
    titleScreen.style.display = ''; // restore default so overlay is visible again
}

// Start the actual game
function startGame() {
    score = 0;
    health = 3;
    room = 1;
    gameStarted = false; // don't start enemy or timer yet

    // explicitly hide the title overlay so it can't block the game
    titleScreen.classList.add('hidden');
    titleScreen.style.display = 'none';
    gameEl.classList.remove('hidden');
    updateHUD();

    // make absolutely sure the input box is cleared before showing the first word
    if (inputEl) {
        inputEl.value = '';
    }

    // Show the first target word now but do NOT start the timer.
    // The timer will start when the player begins typing.
    loadEnemy(false); // display word, no timer
    showFeedback('Type to begin', true);
    inputEl.focus();
}

// Input check: when Enter pressed or automatic match
inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        // If game hasn't started yet, start it only if there's input
        const typedRaw = inputEl.value;
        const typed = typedRaw.trim();
        if (!gameStarted) {
            if (typed.length === 0) return; // still waiting for player to begin typing
            // begin the timer for the displayed word; preserve typed characters
            gameStarted = true;
            startTimer();
        }
        // only check after gameStarted is true
        if (typed.length === 0) return;
        if (typed.toLowerCase() === currentWord.toLowerCase()) {
            handleCorrect();
        } else {
            handleMiss('Miss! Wrong word.');
        }
    }
});

// Auto-match while typing: if exact match, accept immediately
inputEl.addEventListener('input', () => {
    const typedRaw = inputEl.value;
    const typed = typedRaw.trim();
    // If the game hasn't started yet, start the round on first typed character
    if (!gameStarted) {
        if (typed.length === 0) return;
        gameStarted = true;
        // start the timer for the already-displayed word
        startTimer();
        // continue and allow immediate auto-match check below
    }
    if (typed.length > 0 && typed.toLowerCase() === currentWord.toLowerCase()) {
        handleCorrect();
    }
});

// Initialize on DOMContentLoaded
function initOnLoad() {
    // Guard: if essential elements are missing, log and do nothing further
    if (!titleScreen || !gameEl || !startBtn || !inputEl) {
        console.warn('Dungeon of Thirst: some DOM elements are missing, aborting init.');
        return;
    }

    // reset button may not exist in older markup; get it now and attach listener if present
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            resetToTitle();
        });
    }
    // attach the Return Home button handler (shows after win)
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            resetToTitle();
        });
    }

    // Ensure overlays are in the expected default state
    gameEl.classList.add('hidden');      // hide game area
    titleScreen.classList.remove('hidden'); // show title
    titleScreen.style.display = ''; // ensure overlay is visible

    // difficulty buttons (may not exist if HTML not updated)
    const diffEasy = document.getElementById('diff-easy');
    const diffMedium = document.getElementById('diff-medium');
    const diffHard = document.getElementById('diff-hard');
    function applyDifficulty(d) {
        difficulty = d;
        // adjust timer len per difficulty
        if (difficulty === 'easy') timePerRoom = 12;
        else if (difficulty === 'medium') timePerRoom = 9;
        else if (difficulty === 'hard') timePerRoom = 6;
        // update UI active state if buttons available
        [diffEasy, diffMedium, diffHard].forEach(btn => {
            if (!btn) return;
            btn.classList.toggle('active', btn.id === `diff-${d}`);
        });
    }
    // attach listeners if elements exist
    if (diffEasy) diffEasy.addEventListener('click', () => applyDifficulty('easy'));
    if (diffMedium) diffMedium.addEventListener('click', () => applyDifficulty('medium'));
    if (diffHard) diffHard.addEventListener('click', () => applyDifficulty('hard'));
    // set default
    applyDifficulty(difficulty);

    // Attach Start button listener now that DOM is ready
    startBtn.addEventListener('click', () => {
        startGame();
    });

    // Clear any stray timers to be safe
    clearTimeout(timeoutId);
    clearInterval(countdownId);

    // Reset values and HUD to safe defaults
    score = 0;
    health = 3;
    room = 1;
    currentWord = '';
    gameStarted = false;
    updateHUD();
    feedbackEl.innerText = '';
    enemyWordEl.innerText = '--';
    countdownEl.innerText = '--';

    // Show title screen state
    resetToTitle();
}

// Run init immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initOnLoad);
} else {
    initOnLoad();
}

// launchConfetti uses the canvas-confetti library (loaded from CDN)
// Simple wrapper so callers can request a confetti burst.
function launchConfetti(count = 40) {
    if (typeof confetti !== 'function') {
        console.warn('Confetti library not loaded. Include canvas-confetti via CDN.');
        return;
    }
    // brand colors for confetti pieces
    const colors = ['#FFC907', '#2E9DF7', '#8BD1CB', '#F5402C'];
    // several small bursts tightly clustered around the center (x ≈ 0.5)
    const bursts = 4;
    for (let i = 0; i < bursts; i++) {
        confetti({
            particleCount: Math.round(count / bursts),
            spread: 24 + i * 6,               // small to moderate spread
            startVelocity: 36 - i * 6,
            gravity: 0.6,
            // center with a small jitter so most pieces originate near the center
            origin: { x: 0.5 + (Math.random() - 0.5) * 0.06, y: 0.18 + Math.random() * 0.04 },
            colors
        });
    }
}
