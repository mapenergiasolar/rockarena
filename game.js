/**
 * ROCK ARENA - GAME ENGINE
 * Rhythm mechanics, audio-visual sync, Gamepad API, and Class systems.
 */

// Game Configuration & State
const GAME_CFG = {
    bpm: 120,
    noteSpeed: 450, // pixels per second
    hitWindowPerfect: 0.05, // seconds (+- 50ms)
    hitWindowGood: 0.12,    // seconds (+- 120ms)
    hitWindowOk: 0.20,      // seconds (+- 200ms)
    scorePerfect: 1000,
    scoreGood: 500,
    scoreOk: 250,
    maxTugValue: 100, // 0 is Full Player, 100 is Full Rival, 50 is Neutral
};

const state = {
    currentScreen: 'menu-screen',
    selectedClass: null,
    inputMode: 'keyboard', // 'keyboard' or 'gamepad'
    audioOffset: 0, // ms, for lag calibration
    
    // Gameplay Stats
    playerScore: 0,
    rivalScore: 0,
    combo: 0,
    maxCombo: 0,
    notesHit: 0,
    notesMissed: 0,
    totalNotes: 0,
    accuracy: 100,
    
    // Tug of War
    tugValue: 50, // Starts neutral
    
    // Hability System
    specialEnergy: 0,
    specialActive: false,
    specialDuration: 6000, // 6 seconds
    specialTimer: null,
    comboShieldHits: 0, // for rhythm class
    grooveAnchorActive: false, // for bass class
    
    // Engine internals
    isLoopRunning: false,
    notes: [],
    particles: [],
    activeTouches: [false, false, false, false, false], // Lane hit visual state
    holdingNotes: [null, null, null, null, null],
    lastGamepadButtonState: Array(16).fill(false),
    
    // Audio / Video refs
    songDuration: 30, // seconds fallback
    isMuted: false,
    get ctx() { return els.ctx; }
};

// UI Elements
const els = {
    menuScreen: document.getElementById('menu-screen'),
    classScreen: document.getElementById('class-screen'),
    gameScreen: document.getElementById('game-screen'),
    resultsScreen: document.getElementById('results-screen'),
    calibrationModal: document.getElementById('calibration-modal'),
    
    bgVideo: document.getElementById('bg-video'),
    specialVideo: document.getElementById('special-video'),
    gameAudio: document.getElementById('game-audio'),
    
    // Buttons
    btnStartGame: document.getElementById('btn-start-game'),
    btnOpenCalibration: document.getElementById('btn-open-calibration'),
    btnConfirmClass: document.getElementById('btn-confirm-class'),
    btnBackToMenu: document.getElementById('btn-back-to-menu'),
    btnRestartGame: document.getElementById('btn-restart-game'),
    btnBackToMenuRes: document.getElementById('btn-back-to-menu-res'),
    btnCloseCalibration: document.getElementById('btn-close-calibration'),
    calibrationTapBtn: document.getElementById('calibration-tap-btn'),
    
    // Inputs
    inputKbd: document.getElementById('input-kbd'),
    inputGpad: document.getElementById('input-gpad'),
    offsetSlider: document.getElementById('offset-slider'),
    offsetValue: document.getElementById('offset-value'),
    
    // HUD Player/Rival
    playerScoreTxt: document.getElementById('player-score'),
    rivalScoreTxt: document.getElementById('rival-score'),
    tugBarFill: document.getElementById('tug-bar-fill'),
    tugBarMarker: document.getElementById('tug-bar-marker'),
    tugStatus: document.getElementById('tug-status'),
    
    // HUD Stats
    comboCount: document.getElementById('combo-count'),
    comboMultiplier: document.getElementById('combo-multiplier'),
    hudAccuracy: document.getElementById('hud-accuracy'),
    hudClassName: document.getElementById('hud-class-name'),
    hudClassRole: document.getElementById('hud-class-role'),
    specialBarFill: document.getElementById('special-bar-fill'),
    specialHint: document.getElementById('special-hint'),
    
    // Feedback & Overlay
    rhythmFeedback: document.getElementById('rhythm-feedback'),
    skillOverlay: document.getElementById('skill-activation-overlay'),
    skillBannerText: document.getElementById('skill-banner-text'),
    
    // Canvas
    canvas: document.getElementById('rhythm-canvas'),
    ctx: document.getElementById('rhythm-canvas').getContext('2d'),
    
    // Class Cards
    classCards: document.querySelectorAll('.class-card')
};

// Lane configurations for key bindings and drawing
const laneKeys = {
    0: { key: 'a', color: '#ff3366', targetEl: document.getElementById('target-0') },
    1: { key: 's', color: '#ffcc00', targetEl: document.getElementById('target-1') },
    2: { key: 'd', color: '#ff7700', targetEl: document.getElementById('target-2') },
    3: { key: 'k', color: '#33ff66', targetEl: document.getElementById('target-3') },
    4: { key: 'l', color: '#00ccff', targetEl: document.getElementById('target-4') }
};

// Gamepad button map (Standard gamepad)
const gpadButtons = {
    0: 14, // Lane 0: D-Pad Left (usually index 14 on standard mappings)
    1: 13, // Lane 1: D-Pad Down (usually 13)
    2: 12, // Lane 2: D-Pad Up (usually 12)
    3: 2,  // Lane 3: Button X / A (usually 0 or 2 depending on layout - mapping Square/X)
    4: 1,  // Lane 4: Button O / B (usually 1)
    special: 4 // L1 (button 4) or R1 (button 5)
};

// Class Metadata
const classesMetadata = {
    solo: { name: 'Guitarrista Solo', role: 'DPS', color: varColor('--neon-red') },
    rhythm: { name: 'Guitarrista Base', role: 'SUPORTE', color: varColor('--neon-green') },
    bass: { name: 'Baixista', role: 'DEFESA', color: varColor('--neon-blue') },
    drums: { name: 'Baterista', role: 'ENERGIA', color: varColor('--neon-yellow') }
};

function varColor(cssVarName) {
    return getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim() || '#ffffff';
}

// ----------------------------------------------------
// NOTE GENERATOR & CHART DEFINITIONS (PER INSTRUMENT)
// ----------------------------------------------------
function generateClassChart(classType) {
    const chart = [];
    const beatInterval = 60 / GAME_CFG.bpm; // 0.5s for 120bpm
    const totalDuration = 180; // support up to 3 minutes
    
    let time = 3.0; // Start notes after 3 seconds of intro
    
    if (classType === 'solo') {
        // Solo Guitar: fast, intense runs and solo clusters
        while (time < totalDuration - 2) {
            const isSoloSection = (Math.floor(time / 12) % 3 === 0); // solo segments
            
            if (isSoloSection) {
                const count = 6 + Math.floor(Math.random() * 4);
                let lane = Math.floor(Math.random() * 5);
                for (let i = 0; i < count; i++) {
                    chart.push({ time: time, lane: lane, hit: false, missed: false });
                    time += beatInterval / 3; // fast 12th/16th notes
                    lane = (lane + (Math.random() > 0.5 ? 1 : -1) + 5) % 5;
                }
                // End the solo run with a long bend sustain note!
                chart.push({ time: time, lane: lane, duration: 1.2, hit: false, missed: false });
                time += beatInterval * 2.5;
            } else {
                chart.push({ time: time, lane: Math.floor(Math.random() * 5), hit: false, missed: false });
                // 20% chance of a short vibrato sustain note
                if (Math.random() < 0.2) {
                    chart.push({ time: time + beatInterval, lane: Math.floor(Math.random() * 5), duration: 0.8, hit: false, missed: false });
                    time += beatInterval * 2.5;
                } else {
                    if (Math.random() < 0.4) {
                        chart.push({ time: time + beatInterval / 2, lane: Math.floor(Math.random() * 5), hit: false, missed: false });
                    }
                    time += beatInterval;
                }
            }
        }
    } else if (classType === 'rhythm') {
        // Rhythm Guitar: chords (double notes) on downbeats
        while (time < totalDuration - 2) {
            const lane1 = Math.floor(Math.random() * 2);
            const lane2 = 3 + Math.floor(Math.random() * 2);
            
            // Sustain chords! 30% chance
            const isSustain = Math.random() < 0.3;
            const duration = isSustain ? 1.0 + Math.random() * 1.0 : 0;
            
            chart.push({ time: time, lane: lane1, duration: duration, hit: false, missed: false });
            chart.push({ time: time, lane: lane2, duration: duration, hit: false, missed: false });
            
            if (isSustain) {
                time += beatInterval * 3;
            } else {
                if (Math.random() < 0.5) {
                    chart.push({ time: time + beatInterval / 2, lane: Math.floor(Math.random() * 5), hit: false, missed: false });
                }
                time += beatInterval * (Math.random() > 0.8 ? 2 : 1);
            }
        }
    } else if (classType === 'bass') {
        // Bass: steady slow notes on low lanes (0 and 1)
        let activeLane = 0;
        while (time < totalDuration - 2) {
            // 40% chance of a long groove sustain note
            const isSustain = Math.random() < 0.4;
            const duration = isSustain ? 0.8 + Math.random() * 0.8 : 0;
            
            chart.push({ time: time, lane: activeLane, duration: duration, hit: false, missed: false });
            activeLane = activeLane === 0 ? 1 : (Math.random() > 0.8 ? 0 : activeLane);
            
            if (isSustain) {
                time += beatInterval * 3;
            } else {
                time += Math.random() > 0.6 ? beatInterval * 2 : beatInterval;
            }
        }
    } else if (classType === 'drums') {
        // Drums: Kick (0), Snare (1/2), Hihat (3), Crash (4)
        while (time < totalDuration - 2) {
            const beatNum = Math.floor(time / beatInterval);
            
            // Kick on 1 and 3
            if (beatNum % 2 === 0) {
                chart.push({ time: time, lane: 0, hit: false, missed: false });
            }
            // Snare on 2 and 4
            if (beatNum % 2 === 1) {
                chart.push({ time: time, lane: Math.random() > 0.5 ? 1 : 2, hit: false, missed: false });
            }
            // Steady hihat (every half beat) on lane 3
            chart.push({ time: time, lane: 3, hit: false, missed: false });
            chart.push({ time: time + beatInterval / 2, lane: 3, hit: false, missed: false });
            
            // Crash cymbal on beat 8 on lane 4
            if (beatNum % 8 === 0) {
                chart.push({ time: time, lane: 4, hit: false, missed: false });
            }
            
            time += beatInterval;
        }
    }
    
    // Sort notes by timestamp
    chart.sort((a, b) => a.time - b.time);
    state.totalNotes = chart.length;
    return chart;
}

// ----------------------------------------------------
// UI INITIALIZATION & TRANSITIONS
// ----------------------------------------------------
function showScreen(screenId) {
    state.currentScreen = screenId;
    
    // Toggle active states
    els.menuScreen.className = screenId === 'menu-screen' ? 'active-screen' : 'hidden-screen';
    els.classScreen.className = screenId === 'class-screen' ? 'active-screen' : 'hidden-screen';
    els.gameScreen.className = screenId === 'game-screen' ? 'active-screen' : 'hidden-screen';
    els.resultsScreen.className = screenId === 'results-screen' ? 'active-screen' : 'hidden-screen';

    // Handle background cinematic videos depending on the screen
    if (screenId === 'menu-screen') {
        els.bgVideo.src = "Game_trailer_intro_stadium_202606151550.mp4";
        els.bgVideo.load();
        els.bgVideo.play().catch(e => console.log("Autoplay blocked: user must click first."));
    } else if (screenId === 'game-screen') {
        let videoSrc = "Rocker_shreds_guitar_solo_stage_202606151550.mp4";
        if (state.selectedClass === 'solo') videoSrc = "guitar.mp4";
        else if (state.selectedClass === 'rhythm') videoSrc = "base guitar.mp4";
        else if (state.selectedClass === 'bass') videoSrc = "bass.mp4";
        else if (state.selectedClass === 'drums') videoSrc = "drums.mp4";
        
        els.bgVideo.src = videoSrc;
        els.bgVideo.load();
        // Video playing is managed by startSong() inside game loop to guarantee sync
    } else if (screenId === 'results-screen') {
        els.bgVideo.src = "Band_battle_epic_finale_victory_202606151550.mp4";
        els.bgVideo.load();
        els.bgVideo.play().catch(e => console.log("Autoplay blocked."));
    }
}

// Set active inputs classes
function selectInputMode(mode) {
    state.inputMode = mode;
    if (mode === 'keyboard') {
        els.inputKbd.classList.add('active');
        els.inputGpad.classList.remove('active');
    } else {
        els.inputKbd.classList.remove('active');
        els.inputGpad.classList.add('active');
    }
}

// Class Card interactions
els.classCards.forEach(card => {
    card.addEventListener('click', () => {
        // Remove selection from all cards
        els.classCards.forEach(c => c.classList.remove('selected'));
        // Select clicked card
        card.classList.add('selected');
        state.selectedClass = card.getAttribute('data-class');
        els.btnConfirmClass.removeAttribute('disabled');
    });
});

// Calibration tap calculations
let lastTapTimes = [];
function handleCalibrationTap() {
    const now = performance.now();
    lastTapTimes.push(now);
    if (lastTapTimes.length > 5) lastTapTimes.shift();
    
    // Estimate BPM and target rhythm offsets
    if (lastTapTimes.length >= 2) {
        let diffs = [];
        for (let i = 1; i < lastTapTimes.length; i++) {
            diffs.push(lastTapTimes[i] - lastTapTimes[i-1]);
        }
        
        // Average beat difference
        const avgDiff = diffs.reduce((a, b) => a + b) / diffs.length;
        // Adjust closest target step
        const beatDurationMs = (60 / GAME_CFG.bpm) * 1000;
        const remainder = avgDiff % beatDurationMs;
        const calculatedOffset = remainder > beatDurationMs / 2 ? remainder - beatDurationMs : remainder;
        
        // Clamp and set offset
        const finalOffset = Math.round(Math.max(-300, Math.min(300, calculatedOffset)));
        state.audioOffset = finalOffset;
        els.offsetSlider.value = finalOffset;
        els.offsetValue.innerText = `${finalOffset}ms`;
    }
}

// ----------------------------------------------------
// GAME ENGINE & GAME LOOP
// ----------------------------------------------------
function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    els.canvas.width = els.canvas.clientWidth * dpr;
    els.canvas.height = els.canvas.clientHeight * dpr;
    state.canvasWidth = els.canvas.width;
    state.canvasHeight = els.canvas.height;
}

window.addEventListener('resize', setupCanvas);

function startGameplay() {
    showScreen('game-screen');
    setupCanvas();
    
    // Reset Stats
    state.playerScore = 0;
    state.rivalScore = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.notesHit = 0;
    state.notesMissed = 0;
    state.accuracy = 100;
    state.tugValue = 50;
    state.specialEnergy = 0;
    state.holdingNotes = [null, null, null, null, null];
    state.specialActive = false;
    state.comboShieldHits = 0;
    state.grooveAnchorActive = false;
    
    els.playerScoreTxt.innerText = "000,000";
    els.rivalScoreTxt.innerText = "000,000";
    updateTugOfWarUI();
    updateComboUI();
    updateSpecialUI();
    els.hudAccuracy.innerText = "100%";
    
    // Setup class displays
    const classMeta = classesMetadata[state.selectedClass];
    els.hudClassName.innerText = classMeta.name;
    els.hudClassName.style.color = classMeta.color;
    els.hudClassRole.innerText = classMeta.role;
    els.hudClassRole.style.color = classMeta.color;
    
    // Generate Chart specific to class
    state.notes = generateClassChart(state.selectedClass);
    state.particles = [];
    
    // Configure audio source
    els.gameAudio.src = "song.mp3";
    els.gameAudio.volume = 0.8;
    
    // Configure background video (looping, muted for autoplay compliance)
    els.bgVideo.muted = true;
    els.bgVideo.currentTime = 0;
    els.bgVideo.style.opacity = '1';
    els.bgVideo.play().catch(e => console.log("Vídeo autoplay bloqueado, rodando em background"));
    
    // Preload special video
    els.specialVideo.src = "full band.mp4";
    els.specialVideo.load();
    els.specialVideo.muted = true;
    els.specialVideo.currentTime = 0;
    els.specialVideo.style.display = 'none';
    els.specialVideo.style.opacity = '0';
    
    // Play audio element (bypasses autoplay lock since CONFIRMAR CLASSE is a click gesture)
    els.gameAudio.play()
        .then(() => {
            console.log("song.mp3 carregada e tocando com sucesso!");
            state.isLoopRunning = true;
            rhythmLoop();
        })
        .catch(err => {
            console.warn("song.mp3 não encontrada ou autoplay bloqueado. Usando fallback de áudio do vídeo...");
            // Fallback: load video file directly as the audio source
            let videoSrc = "Rocker_shreds_guitar_solo_stage_202606151550.mp4";
            if (state.selectedClass === 'solo') videoSrc = "guitar.mp4";
            else if (state.selectedClass === 'rhythm') videoSrc = "base guitar.mp4";
            else if (state.selectedClass === 'bass') videoSrc = "bass.mp4";
            else if (state.selectedClass === 'drums') videoSrc = "drums.mp4";

            els.gameAudio.src = videoSrc;
            els.gameAudio.load();
            els.gameAudio.play()
                .then(() => {
                    state.isLoopRunning = true;
                    rhythmLoop();
                })
                .catch(fallbackErr => {
                    console.error("Falha ao tocar fallbacks de áudio. Rodando jogo silencioso.", fallbackErr);
                    state.isLoopRunning = true;
                    rhythmLoop();
                });
        });
}

function stopGameplay() {
    state.isLoopRunning = false;
    els.bgVideo.pause();
    els.specialVideo.pause();
    els.gameAudio.pause();
    if (state.specialTimer) clearTimeout(state.specialTimer);
}

// Core Game Loop
function rhythmLoop() {
    if (!state.isLoopRunning) return;
    
    updateGamepadInput();
    updateGameLogic();
    drawRhythmFrame();
    
    requestAnimationFrame(rhythmLoop);
}

function updateGameLogic() {
    // Sincronizar com o timer do reprodutor de áudio principal
    const currentAudioTime = els.gameAudio.currentTime + (state.audioOffset / 1000);
    
    // Process active holding sustain notes
    for (let lane = 0; lane < 5; lane++) {
        const note = state.holdingNotes[lane];
        if (note) {
            if (!state.activeTouches[lane]) {
                state.holdingNotes[lane] = null;
                continue;
            }
            if (currentAudioTime > note.time + note.duration) {
                state.holdingNotes[lane] = null;
                state.playerScore += 150;
                els.playerScoreTxt.innerText = formatScore(state.playerScore);
                spawnHitParticles(lane, 'perfect');
                continue;
            }
            state.playerScore += 3;
            els.playerScoreTxt.innerText = formatScore(state.playerScore);
            if (Math.random() < 0.4) {
                spawnSustainParticle(lane);
            }
        }
    }

    // Check for missed notes
    state.notes.forEach(note => {
        if (!note.hit && !note.missed) {
            // If the note has scrolled past the hit target by too much
            if (currentAudioTime > note.time + GAME_CFG.hitWindowOk) {
                triggerMiss(note);
            }
        }
    });
    
    // Simple Rival AI simulation
    // Rival scores and pushes Tug-of-war depending on difficulty
    const matchTime = els.gameAudio.currentTime;
    
    if (state.isLoopRunning && matchTime > 0.5) {
        // Proc rival points slowly over time
        if (Math.random() < 0.08) {
            // Check if groove anchor is active (Baixista skill stops opponent gains)
            if (!state.grooveAnchorActive) {
                state.rivalScore += Math.floor(Math.random() * 800) + 200;
                els.rivalScoreTxt.innerText = formatScore(state.rivalScore);
                
                const defenseFactor = (state.selectedClass === 'bass') ? 0.5 : 1.0;
                adjustTugValue(0.4 * defenseFactor);
            }
        }
    }
    
    // Check if song has ended (either audio ended, or track duration reached)
    if (els.gameAudio.ended || (matchTime > 0 && els.gameAudio.paused)) {
        endGame();
    }
}

// ----------------------------------------------------
// INPUT DETECTIONS (KEYBOARD & GAMEPAD)
// ----------------------------------------------------
function processHit(laneIndex) {
    const currentAudioTime = els.gameAudio.currentTime + (state.audioOffset / 1000);
    
    // Find first active unhit note in this lane
    const targetNote = state.notes.find(note => note.lane === laneIndex && !note.hit && !note.missed);
    
    // Visual hit indicator trigger
    flashTarget(laneIndex);
    
    if (!targetNote) {
        // Miss hit (strumming with no notes)
        spawnEmptyHitParticle(laneIndex);
        return;
    }
    
    const diff = Math.abs(targetNote.time - currentAudioTime);
    
    if (diff <= GAME_CFG.hitWindowPerfect) {
        triggerHit(targetNote, 'perfect');
    } else if (diff <= GAME_CFG.hitWindowGood) {
        triggerHit(targetNote, 'good');
    } else if (diff <= GAME_CFG.hitWindowOk) {
        triggerHit(targetNote, 'ok');
    } else if (currentAudioTime < targetNote.time - GAME_CFG.hitWindowOk) {
        // Too early hit, ignore or slight miss penalty
        spawnEmptyHitParticle(laneIndex);
    }
}

function triggerHit(note, precision) {
    note.hit = true;
    state.notesHit++;
    
    // If it's a sustain note, start holding!
    if (note.duration > 0) {
        state.holdingNotes[note.lane] = note;
    }
    
    // Multiplier calculation
    let mult = 1;
    if (state.combo >= 40) mult = 4;
    else if (state.combo >= 25) mult = 3;
    else if (state.combo >= 10) mult = 2;
    
    // Class modifiers
    let scoreBase = GAME_CFG.scorePerfect;
    if (precision === 'good') scoreBase = GAME_CFG.scoreGood;
    else if (precision === 'ok') scoreBase = GAME_CFG.scoreOk;
    
    // Guitarrista Solo (DPS) gives double points during special blitz
    let classBonus = 1.0;
    if (state.selectedClass === 'solo' && state.specialActive) {
        classBonus = 2.0;
    }
    
    const pointsGained = Math.round(scoreBase * mult * classBonus);
    state.playerScore += pointsGained;
    els.playerScoreTxt.innerText = formatScore(state.playerScore);
    
    // Combo increment
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    
    // Charge Special meter
    // Baterista charges 2x faster, others regular, some double points
    let chargeSpeed = 3; // 3% per hit
    if (state.selectedClass === 'drums') {
        chargeSpeed = 6;
    }
    if (!state.specialActive) {
        state.specialEnergy = Math.min(100, state.specialEnergy + chargeSpeed);
    }
    
    // Push Tug of War left (towards player 0)
    // Guitarrista Solo hits push more, etc.
    let pushValue = 1.5;
    if (precision === 'perfect') pushValue = 2.5;
    if (state.selectedClass === 'solo') pushValue *= 1.25;
    adjustTugValue(-pushValue);
    
    // Trigger effects
    showRhythmFeedback(precision);
    spawnHitParticles(note.lane, precision);
    updateComboUI();
    updateSpecialUI();
    calculateAccuracy();
}

function triggerMiss(note) {
    note.missed = true;
    state.notesMissed++;
    
    // Handle Combo Shield (Guitarrista Base)
    if (state.selectedClass === 'rhythm' && state.specialActive && state.comboShieldHits > 0) {
        state.comboShieldHits--;
        // Shield absorbs the combo break!
        showRhythmFeedback('shield');
        spawnHitParticles(note.lane, 'shield');
    } else {
        // Normal combo break
        state.combo = 0;
        showRhythmFeedback('miss');
        
        // Push Tug of War right (rival gain)
        // rhythm class reduces loss
        let pullFactor = 4.0;
        if (state.selectedClass === 'rhythm') pullFactor = 2.0; // protects team
        adjustTugValue(pullFactor);
        
        updateComboUI();
    }
    
    calculateAccuracy();
}

function triggerSpecialSkill() {
    if (state.specialEnergy < 100 || state.specialActive) return;
    
    state.specialActive = true;
    state.specialEnergy = 0;
    
    // Smooth transition to full band video
    els.specialVideo.style.display = 'block';
    els.specialVideo.currentTime = els.bgVideo.currentTime;
    els.specialVideo.play().then(() => {
        els.bgVideo.style.opacity = '0';
        els.specialVideo.style.opacity = '1';
    }).catch(e => console.warn("Erro ao iniciar vídeo de especial: ", e));

    // Skill overlays & messages
    els.skillOverlay.classList.add('active');
    els.skillBannerText.classList.add('show');
    
    const cl = state.selectedClass;
    let skillText = "SHRED BLITZ!";
    
    if (cl === 'solo') {
        // DPS - points doubled already handled
        skillText = "SHRED BLITZ (DPS x2 PONTOS!)";
    } else if (cl === 'rhythm') {
        // Support - combo protector
        state.comboShieldHits = 3;
        skillText = "ESCUDO DE RITMO (PROTEGE COMBO)";
    } else if (cl === 'bass') {
        // Defense - freeze rival
        state.grooveAnchorActive = true;
        skillText = " Groove Anchor (Bloqueia Inimigo!)";
    } else if (cl === 'drums') {
        // Energy - speeds up score push
        skillText = "OVERDRIVE BEAT (PONTUAÇÃO RAPIDA!)";
    }
    
    els.skillBannerText.innerText = skillText;
    
    // Remove banner class after animation ends
    setTimeout(() => {
        els.skillBannerText.classList.remove('show');
    }, 1500);
    
    // Skill duration timer
    state.specialTimer = setTimeout(() => {
        state.specialActive = false;
        state.grooveAnchorActive = false;
        els.skillOverlay.classList.remove('active');
        updateSpecialUI();
        
        // Restore background video to normal instrument
        els.bgVideo.style.opacity = '1';
        els.specialVideo.style.opacity = '0';
        setTimeout(() => {
            if (!state.specialActive) {
                els.specialVideo.pause();
                els.specialVideo.style.display = 'none';
            }
        }, 500);
    }, state.specialDuration);
    
    updateSpecialUI();
}

// Keyboard Listeners
window.addEventListener('keydown', (e) => {
    if (state.currentScreen !== 'game-screen' || e.repeat) return;
    
    const key = e.key.toLowerCase();
    
    if (key === 'escape') {
        stopGameplay();
        showScreen('menu-screen');
        return;
    }
    
    if (key === ' ') {
        triggerSpecialSkill();
        return;
    }
    
    // Lane keys
    for (let i = 0; i < Object.keys(laneKeys).length; i++) {
        if (key === laneKeys[i].key) {
            state.activeTouches[i] = true;
            processHit(i);
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (state.currentScreen !== 'game-screen') return;
    const key = e.key.toLowerCase();
    for (let i = 0; i < Object.keys(laneKeys).length; i++) {
        if (key === laneKeys[i].key) {
            state.activeTouches[i] = false;
            laneKeys[i].targetEl.classList.remove('active');
            state.holdingNotes[i] = null;
        }
    }
});

// Gamepad polling
function updateGamepadInput() {
    if (state.inputMode !== 'gamepad') return;
    
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];
    
    if (!gp) return;
    
    // Map button triggers on change state
    const currentBtnState = gp.buttons.map(b => b.pressed);
    
    // Button mapping array check
    // PS5 Standard / Xbox mappings
    const laneButtons = [
        gpadButtons[0], // Dpad Left
        gpadButtons[1], // Dpad Down
        gpadButtons[2], // Dpad Up
        gpadButtons[3], // A / X button
        gpadButtons[4]  // B / O button
    ];
    
    laneButtons.forEach((btnIndex, lane) => {
        const isPressed = currentBtnState[btnIndex];
        const wasPressed = state.lastGamepadButtonState[btnIndex];
        
        if (isPressed && !wasPressed) {
            // Button pressed down
            state.activeTouches[lane] = true;
            processHit(lane);
        } else if (!isPressed && wasPressed) {
            // Button released
            state.activeTouches[lane] = false;
            laneKeys[lane].targetEl.classList.remove('active');
            state.holdingNotes[lane] = null;
        }
    });
    
    // Special skill activation: L1 / R1
    const specialPressed = currentBtnState[4] || currentBtnState[5]; // L1 or R1
    const specialWasPressed = state.lastGamepadButtonState[4] || state.lastGamepadButtonState[5];
    
    if (specialPressed && !specialWasPressed) {
        triggerSpecialSkill();
    }
    
    // Keep record of button states
    state.lastGamepadButtonState = currentBtnState;
}

// ----------------------------------------------------
// UI HELPERS & CALCULATIONS
// ----------------------------------------------------
function formatScore(score) {
    return score.toLocaleString('en-US', { minimumIntegerDigits: 6, useGrouping: true });
}

function adjustTugValue(amount) {
    state.tugValue = Math.max(0, Math.min(GAME_CFG.maxTugValue, state.tugValue + amount));
    updateTugOfWarUI();
}

function updateTugOfWarUI() {
    // 0 is full Left, 100 is full Right. Adjust the UI marker position.
    els.tugBarMarker.style.left = `${state.tugValue}%`;
    
    if (state.tugValue < 40) {
        els.tugStatus.innerText = "DOMÍNIO DA SUA BANDA!";
        els.tugStatus.className = "tug-status-text text-neon-red";
    } else if (state.tugValue > 60) {
        els.tugStatus.innerText = "RIVAIS DOMINANDO!";
        els.tugStatus.className = "tug-status-text text-neon-blue";
    } else {
        els.tugStatus.innerText = "Batalha Equilibrada";
        els.tugStatus.className = "tug-status-text";
    }
}

function updateComboUI() {
    els.comboCount.innerText = state.combo;
    
    let mult = 1;
    if (state.combo >= 40) mult = 4;
    else if (state.combo >= 25) mult = 3;
    else if (state.combo >= 10) mult = 2;
    
    els.comboMultiplier.innerText = `${mult}x`;
    
    // visual flash on multiplier tiers
    if (state.combo === 10 || state.combo === 25 || state.combo === 40) {
        els.comboCount.style.animation = 'none';
        setTimeout(() => {
            els.comboCount.style.animation = 'popFeedback 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        }, 10);
    }
}

function updateSpecialUI() {
    els.specialBarFill.style.width = `${state.specialEnergy}%`;
    
    if (state.specialActive) {
        els.specialBarFill.classList.add('ready');
        els.specialBarFill.style.width = '100%';
        els.specialHint.classList.remove('show');
    } else if (state.specialEnergy >= 100) {
        els.specialBarFill.classList.add('ready');
        els.specialHint.classList.add('show');
    } else {
        els.specialBarFill.classList.remove('ready');
        els.specialHint.classList.remove('show');
    }
}

function calculateAccuracy() {
    const totalPlay = state.notesHit + state.notesMissed;
    if (totalPlay === 0) {
        state.accuracy = 100;
    } else {
        state.accuracy = Math.round((state.notesHit / totalPlay) * 100);
    }
    els.hudAccuracy.innerText = `${state.accuracy}%`;
}

function showRhythmFeedback(type) {
    els.rhythmFeedback.className = "feedback-text show";
    
    if (type === 'perfect') {
        els.rhythmFeedback.innerText = "PERFEITO!";
        els.rhythmFeedback.classList.add('feedback-perfect');
    } else if (type === 'good') {
        els.rhythmFeedback.innerText = "BOM!";
        els.rhythmFeedback.classList.add('feedback-good');
    } else if (type === 'ok') {
        els.rhythmFeedback.innerText = "OK!";
        els.rhythmFeedback.classList.add('feedback-ok');
    } else if (type === 'miss') {
        els.rhythmFeedback.innerText = "ERROU!";
        els.rhythmFeedback.classList.add('feedback-miss');
    } else if (type === 'shield') {
        els.rhythmFeedback.innerText = "ESCUDADO!";
        els.rhythmFeedback.classList.add('feedback-perfect');
    }
    
    // Hide feedback text after duration
    setTimeout(() => {
        if (els.rhythmFeedback.innerText === "PERFEITO!" && type !== 'perfect') return; // prevent collision overwrite
        els.rhythmFeedback.classList.remove('show');
    }, 400);
}

function flashTarget(laneIndex) {
    const targetEl = laneKeys[laneIndex].targetEl;
    targetEl.classList.add('active');
}

// ----------------------------------------------------
// PARTICLES RENDERING
// ----------------------------------------------------
function spawnHitParticles(laneIndex, precision) {
    const color = laneKeys[laneIndex].color;
    const count = precision === 'perfect' ? 25 : 12;
    
    // X center of this lane on canvas
    const startX = state.canvasWidth * (0.1 + (laneIndex * 0.2));
    const startY = state.canvasHeight * 0.85;
    
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + (precision === 'perfect' ? 5 : 2);
        state.particles.push({
            x: startX,
            y: startY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2, // burst upwards slightly
            size: Math.random() * 6 + 3,
            color: color,
            alpha: 1,
            decay: Math.random() * 0.03 + 0.02
        });
    }
}

function spawnEmptyHitParticle(laneIndex) {
    const startX = state.canvasWidth * (0.1 + (laneIndex * 0.2));
    const startY = state.canvasHeight * 0.85;
    
    state.particles.push({
        x: startX,
        y: startY,
        vx: 0,
        vy: 0,
        size: 25,
        color: 'rgba(255, 255, 255, 0.2)',
        alpha: 0.8,
        decay: 0.1,
        isRing: true
    });
}

function spawnSustainParticle(laneIndex) {
    const color = laneKeys[laneIndex].color;
    const startX = state.canvasWidth * (0.1 + (laneIndex * 0.2));
    const startY = state.canvasHeight * 0.85;
    
    state.particles.push({
        x: startX + (Math.random() * 20 - 10),
        y: startY,
        vx: (Math.random() * 2 - 1) * 1.5,
        vy: -Math.random() * 3 - 2, // float upwards
        size: Math.random() * 3 + 2,
        color: color,
        alpha: 0.8,
        decay: 0.04
    });
}

function updateAndDrawParticles() {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        
        if (p.alpha <= 0) {
            state.particles.splice(i, 1);
            continue;
        }
        
        state.ctx.save();
        state.ctx.globalAlpha = p.alpha;
        state.ctx.fillStyle = p.color;
        state.ctx.strokeStyle = p.color;
        
        if (p.isRing) {
            state.ctx.beginPath();
            state.ctx.arc(p.x, p.y, p.size * (1 - p.alpha + 0.5), 0, Math.PI * 2);
            state.ctx.lineWidth = 3;
            state.ctx.stroke();
        } else {
            state.ctx.beginPath();
            state.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            state.ctx.fill();
        }
        state.ctx.restore();
    }
}

// ----------------------------------------------------
// CANVAS DRAWING (HIGHWAY GENERATION)
// ----------------------------------------------------
function drawRhythmFrame() {
    const ctx = state.ctx;
    const width = state.canvasWidth;
    const height = state.canvasHeight;
    const currentAudioTime = els.gameAudio.currentTime + (state.audioOffset / 1000);
    
    ctx.clearRect(0, 0, width, height);
    
    // Draw visual guide line at target hit point
    const targetY = height * 0.85;
    
    // Draw sustain tails first (so note heads are drawn on top)
    state.notes.forEach(note => {
        if (note.hit && (currentAudioTime > note.time + note.duration)) return;
        if (note.missed) return;
        if (note.duration > 0) {
            const color = laneKeys[note.lane].color;
            const noteAge = note.time - currentAudioTime;
            
            let noteY = targetY - (noteAge * GAME_CFG.noteSpeed);
            if (state.holdingNotes[note.lane] === note) {
                noteY = targetY; // burns at hit line
            }
            
            const tailEndAge = (note.time + note.duration) - currentAudioTime;
            const tailEndY = targetY - (tailEndAge * GAME_CFG.noteSpeed);
            
            if (tailEndY < height && noteY > -100) {
                const noteX = width * (0.1 + (note.lane * 0.2));
                
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = 14;
                ctx.lineCap = 'round';
                ctx.globalAlpha = 0.55;
                ctx.shadowBlur = 10;
                ctx.shadowColor = color;
                
                ctx.beginPath();
                ctx.moveTo(noteX, noteY);
                ctx.lineTo(noteX, tailEndY);
                ctx.stroke();
                
                if (state.holdingNotes[note.lane] === note) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 6;
                    ctx.globalAlpha = 0.9;
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = '#ffffff';
                    ctx.beginPath();
                    ctx.moveTo(noteX, noteY);
                    ctx.lineTo(noteX, tailEndY);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }
    });

    // Draw scrolling notes
    state.notes.forEach(note => {
        if (note.hit || note.missed) return;
        
        const noteAge = note.time - currentAudioTime;
        const noteY = targetY - (noteAge * GAME_CFG.noteSpeed);
        
        // Only draw if visible on screen
        if (noteY > -50 && noteY < height) {
            const noteX = width * (0.1 + (note.lane * 0.2));
            const color = laneKeys[note.lane].color;
            
            ctx.save();
            // Outer glow effect
            ctx.shadowBlur = 15;
            ctx.shadowColor = color;
            ctx.fillStyle = color;
            
            // Draw note capsule shape
            ctx.beginPath();
            ctx.arc(noteX, noteY, 20, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner core
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(noteX, noteY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    });
    
    // Update and Draw Hit burst particles
    updateAndDrawParticles();
}

// ----------------------------------------------------
// END GAME & STATS COMPILATION
// ----------------------------------------------------
function endGame() {
    stopGameplay();
    
    // Decide winner (Cabo de guerra bar: <= 50 player wins, > 50 rival wins)
    const playerWon = state.tugValue <= 50;
    
    if (playerWon) {
        els.resultsVerdict.innerText = "VITÓRIA!";
        els.resultsVerdict.className = "results-verdict text-neon-red";
        document.getElementById('results-subverdict').innerText = "SUA BANDA DOMINOU A PLATEIA!";
    } else {
        els.resultsVerdict.innerText = "DERROTA";
        els.resultsVerdict.className = "results-verdict text-neon-blue";
        document.getElementById('results-subverdict').innerText = "OS RIVAIS SE APODERARAM DO PALCO...";
    }
    
    // Compile stats into UI
    document.getElementById('res-player-score').innerText = formatScore(state.playerScore);
    document.getElementById('res-rival-score').innerText = formatScore(state.rivalScore);
    document.getElementById('res-accuracy').innerText = `${state.accuracy}%`;
    document.getElementById('res-max-combo').innerText = state.maxCombo;
    
    showScreen('results-screen');
}

// ----------------------------------------------------
// EVENT BINDINGS
// ----------------------------------------------------

// Set screen 1 initial load
showScreen('menu-screen');

// Calibration Slider bindings
els.offsetSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    state.audioOffset = val;
    els.offsetValue.innerText = `${val > 0 ? '+' : ''}${val}ms`;
});

// Calibration tap button
els.calibrationTapBtn.addEventListener('click', handleCalibrationTap);

// Input type toggle buttons
els.inputKbd.addEventListener('click', () => selectInputMode('keyboard'));
els.inputGpad.addEventListener('click', () => selectInputMode('gamepad'));

// Menu Screen navigation
els.btnStartGame.addEventListener('click', () => {
    showScreen('class-screen');
});

els.btnOpenCalibration.addEventListener('click', () => {
    els.calibrationModal.classList.remove('hidden-screen');
});

els.btnCloseCalibration.addEventListener('click', () => {
    els.calibrationModal.classList.add('hidden-screen');
});

// Class Selection screen navigation
els.btnBackToMenu.addEventListener('click', () => {
    showScreen('menu-screen');
});

els.btnConfirmClass.addEventListener('click', () => {
    startGameplay();
});

// Results screen navigation
els.btnRestartGame.addEventListener('click', () => {
    startGameplay();
});

els.btnBackToMenuRes.addEventListener('click', () => {
    showScreen('menu-screen');
});

// Gamepad connection event listeners
window.addEventListener("gamepadconnected", (e) => {
    console.log("Gamepad conectado:", e.gamepad.id);
    selectInputMode('gamepad');
});

window.addEventListener("gamepaddisconnected", (e) => {
    console.log("Gamepad desconectado:", e.gamepad.id);
    selectInputMode('keyboard');
});
