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
// footer is hidden by default in the HTML and will be shown when the player completes the game
const footerEl = document.querySelector('.site-footer');
// Errors tracking: count when typed input diverges from expected word prefix (once per mistake)
let errors = 0;
let hasActiveError = false;
const errorsEl = document.getElementById('errors');
// small score penalty for each typing error
const errorPenalty = 2;
// Audio: play when a word is successfully typed (place the file at /mp3/game-start-317318.mp3)
const wordCompleteAudio = new Audio('mp3/game-start-317318.mp3');
wordCompleteAudio.preload = 'auto';

// Milestone templates (fractions of total rooms). We compute numeric thresholds at runtime
// so "halfway" means halfway through the rooms for the current totalRooms.
const milestoneTemplates = [
	{ fraction: 0.25, message: 'Nice start!' },
	{ fraction: 0.5,  message: 'Halfway there!' },       // true halfway (rooms)
	{ fraction: 0.75, message: 'Almost done!' },
	{ fraction: 1.0,  message: 'You completed the dungeon!' }
];
let milestones = [];             // computed {score, message} entries
const shownMilestones = new Set();

// compute numeric milestone thresholds based on totalRooms and per-room points (10)
function computeMilestones() {
	const pointsPerRoom = 10;
	milestones = milestoneTemplates.map(t => {
		// determine the room index that corresponds to the fraction (round up to next room)
		const roomThreshold = Math.ceil(totalRooms * t.fraction);
		// convert to score
		const scoreThreshold = roomThreshold * pointsPerRoom;
		return { score: scoreThreshold, message: t.message };
	});
	// reset which milestones we've already shown
	shownMilestones.clear();
}

// Game variables
let score = 0;
let health = 3;
let room = 1;
const totalRooms = 8;          // increased from 5 -> game lasts longer (more rooms)
let currentWord = '';
let timeoutId = null;
let countdownId = null;
// time per room is adjustable by difficulty
let timePerRoom = 12; // seconds (default medium increased from 9 -> 12)
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
    // inject small label/value markup into the existing containers so CSS can style them
    if (scoreEl) scoreEl.innerHTML = `<div class="hud-label">Score</div><div class="hud-value">${score}</div>`;
    if (roomEl)  roomEl.innerHTML  = `<div class="hud-label">Room</div><div class="hud-value">${room}</div>`;
    if (errorsEl) errorsEl.innerHTML = `<div class="hud-label">Errors</div><div class="hud-value">${errors}</div>`;
    // render hearts
    healthEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart' + (i < health ? '' : ' empty');
        healthEl.appendChild(heart);
    }
}

// Show feedback message briefly
function showFeedback(text, good, duration = 900) {
    // duration in ms controls how long the message stays
    feedbackEl.innerText = text;
    feedbackEl.style.color = good ? 'green' : 'crimson';
    // flash enemy box
    enemyBox.classList.add(good ? 'flash-good' : 'flash-bad');
    setTimeout(() => {
        enemyBox.classList.remove('flash-good', 'flash-bad');
    }, 550);
    // clear feedback after requested duration (guard against overwriting later messages)
    setTimeout(() => {
        if (feedbackEl.innerText === text) feedbackEl.innerText = '';
    }, duration);
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
    // reset per-word error flag when a new word appears
    hasActiveError = false;
    if (inputEl) inputEl.classList.remove('input-error');
}

// Handle correct typing
function handleCorrect() {
    // play success sound (user gesture from typing ensures browsers allow play)
    try {
        wordCompleteAudio.currentTime = 0;
        wordCompleteAudio.play().catch(() => { /* ignore play errors */ });
    } catch (err) {
        // older browsers or missing file — ignore
    }
    clearTimeout(timeoutId);
    clearInterval(countdownId);
    score += 10;
    // normal feedback
    showFeedback('Correct!', true);
    // advance to next room
    room += 1;
    updateHUD();

    // Milestone check: show the first milestone that matches the new score (only once)
    for (const m of milestones) {
        if (score >= m.score && !shownMilestones.has(m.score)) {
            shownMilestones.add(m.score);
            // show milestone a bit longer so players notice it
            showFeedback(m.message, true, 1600);
            if (typeof launchConfetti === 'function') launchConfetti(12);
            break;
        }
    }

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
        // reveal the footer now that the player has completed the game
        if (footerEl) {
            footerEl.classList.remove('hidden');
            // optional: move keyboard focus to the first link for accessibility
            const firstLink = footerEl.querySelector('a');
            if (firstLink) firstLink.focus();
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
    // hide footer again when returning to title
    if (footerEl) footerEl.classList.add('hidden');
    // reset error tracking
    errors = 0;
    hasActiveError = false;
    if (errorsEl) errorsEl.innerText = `Errors: ${errors}`;
    if (inputEl) inputEl.classList.remove('input-error');
    // clear shown milestones so they can appear in the next playthrough
    shownMilestones.clear();
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
    // do not trim here — spaces matter while typing character-by-character
    const typed = typedRaw;
    // If the game hasn't started yet, start the round on first typed character
    if (!gameStarted) {
        if (typed.length === 0) return;
        gameStarted = true;
        // start the timer for the already-displayed word
        startTimer();
        // continue and allow immediate auto-match check below
    }
    // Mistype detection: if current typed string doesn't match the expected prefix, count an error
    if (typed.length > 0 && currentWord) {
        const expectedPrefix = currentWord.slice(0, typed.length);
        if (typed.toLowerCase() !== expectedPrefix.toLowerCase()) {
            // only count once per mistaken stretch until corrected
            if (!hasActiveError) {
                hasActiveError = true;
                errors += 1;
                // apply a small score penalty but don't go below zero
                const prevScore = score;
                score = Math.max(0, score - errorPenalty);
                // update HUD so the score and errors are shown immediately
                updateHUD();
                // show feedback including the penalty amount
                showFeedback(`Mistyped! -${prevScore - score} pts`, false);
                // mark input visually
                if (inputEl) inputEl.classList.add('input-error');
                // continue (errorsEl is updated by updateHUD)
                // note: we avoid double-updating errorsEl here since updateHUD handles it
            }
        } else {
            // user corrected the input back to a valid prefix
            if (hasActiveError) {
                hasActiveError = false;
                if (inputEl) inputEl.classList.remove('input-error');
            }
        }
    }
    if (typed.length > 0 && typed.toLowerCase() === currentWord.toLowerCase()) {
        handleCorrect();
    }
});

// small helper: create a ripple effect inside a button (works for mouse & touch via pointer events)
function attachButtonRipples() {
    // run once for all .btn elements
    document.querySelectorAll('.btn').forEach(btn => {
        // use pointerdown so it covers touch and mouse
        btn.addEventListener('pointerdown', (ev) => {
            // don't create ripples for keyboard activation (Enter/Space) — pointer events cover direct touch/mouse
            const rect = btn.getBoundingClientRect();
            // create span element for ripple
            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            // calculate position so ripple originates from the interaction point
            const size = Math.max(rect.width, rect.height) * 1.2;
            ripple.style.width = ripple.style.height = `${size}px`;
            // center the ripple at the pointer location
            const x = ev.clientX - rect.left - size / 2;
            const y = ev.clientY - rect.top - size / 2;
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            // append and let CSS animation handle the rest
            btn.appendChild(ripple);
            // remove element after animation completes to keep DOM clean
            setTimeout(() => {
                ripple.remove();
            }, 700);
        }, { passive: true });
    });
}

// improved mobile keyboard handling:
// - scroll the input into view when focused (helps some mobile keyboards avoid covering the field)
// - blur the input when returning to the title so keyboard hides
function attachMobileKeyboardHelpers() {
    if (!inputEl) return;
    inputEl.addEventListener('focus', () => {
        // small delay allows the virtual keyboard to appear first on some devices
        setTimeout(() => {
            try {
                inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (e) { /* ignore if not supported */ }
        }, 250);
    });
    // When starting the game, we already call inputEl.focus(); also scroll to make sure keyboard shows correctly
    const originalStartGame = startGame;
    startGame = function() {
        originalStartGame();
        // small scroll after we reveal the game area and focus input
        setTimeout(() => {
            if (inputEl) {
                try { inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
            }
        }, 280);
    };

    // Ensure keyboard hides when returning to title
    const originalResetToTitle = resetToTitle;
    resetToTitle = function() {
        if (inputEl) {
            inputEl.blur();
        }
        originalResetToTitle();
    };
}

// call these helpers once DOM is ready (initOnLoad already runs on DOMContentLoaded)
const originalInit = initOnLoad;
initOnLoad = function() {
    originalInit();
    // attach micro-interactions + mobile helpers
    attachButtonRipples();
    attachMobileKeyboardHelpers();
};

// Initialize on DOMContentLoaded
function initOnLoad() {
    // Guard: if essential elements are missing, log and do nothing further
    if (!titleScreen || !gameEl || !startBtn || !inputEl) {
        console.warn('WaterQuest: some DOM elements are missing, aborting init.');
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
        if (difficulty === 'easy') timePerRoom = 15;  // more forgiving on easy
        else if (difficulty === 'medium') timePerRoom = 12; // default medium increased
        else if (difficulty === 'hard') timePerRoom = 9;   // hard still faster but slightly longer than before
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
    // compute numeric milestones based on the current totalRooms
    computeMilestones();

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
