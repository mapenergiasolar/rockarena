/**
 * ROCK ARENA - GAME ENGINE
 * Rhythm mechanics, audio-visual sync, Gamepad API, and Class systems.
 */

const DEBUG_DEMO_BATTLE = true;
if (DEBUG_DEMO_BATTLE) {
    console.log("Demo Battle initialized");
}

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

const SONGS_DATABASE = {
    song1: { id: 'song1', title: "Ride Like The Wind", artist: "Jorn", file: "assets/audio/song.mp3", bpm: 125, difficulty: "Fácil" },
    song2: { id: 'song2', title: "Californication", artist: "Red Hot Chili Peppers", file: "assets/audio/song2.mp3", bpm: 96, difficulty: "Médio" },
    song3: { id: 'song3', title: "Hellraiser", artist: "Ozzy Osbourne", file: "assets/audio/song3.mp3", bpm: 96, difficulty: "Difícil" }
};

const state = {
    currentScreen: 'menu-screen',
    selectedSong: null,
    selectedClass: null,
    selectedDifficulty: 'normal',
    inputMode: 'keyboard', // 'keyboard' or 'gamepad'
    audioOffset: 0, // ms, for lag calibration
    waitingForKeyForLane: null, // index of lane waiting for rebind
    
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
    crowdDominance: 50, // 0 = full Rival/Blue, 50 = neutral, 100 = full Player/Red
    
    // Hability System
    specialEnergy: 0,
    specialActive: false,
    specialDuration: 7000, // 7 seconds (Destaque Individual)
    specialTimer: null,
    comboShieldHits: 0, // for rhythm class
    grooveAnchorActive: false, // for bass class
    
    // Collective Band Showtime
    bandEnergy: 0,
    bandShowtimeActive: false,
    bandShowtimeDuration: 10000, // 10 seconds
    bandShowtimeTimer: null,
    
    // Trackers for Results
    individualAbilityUsed: false,
    bandShowtimeUsed: false,
    
    // Rival simulation state
    rival: null,
    
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
    songScreen: document.getElementById('song-screen'),
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
    tugBarLabel: document.querySelector('.tug-bar-label'),
    bandBarFill: document.getElementById('band-bar-fill'),
    bandHint: document.getElementById('band-hint'),
    arenaDominanceOverlay: document.getElementById('arena-dominance-overlay'),
    resWinnerBand: document.getElementById('res-winner-band'),
    resFinalDominance: document.getElementById('res-final-dominance'),
    resIndSkillUsed: document.getElementById('res-ind-skill-used'),
    resShowtimeUsed: document.getElementById('res-showtime-used'),
    
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
    gameStartCountdown: document.getElementById('game-start-countdown'),
    
    // Canvas
    canvas: document.getElementById('rhythm-canvas'),
    ctx: document.getElementById('rhythm-canvas').getContext('2d'),
    
    // Class Cards
    classCards: document.querySelectorAll('.class-card'),
    songCards: document.querySelectorAll('.song-card'),
    btnConfirmSong: document.getElementById('btn-confirm-song'),
    btnBackToMenuSong: document.getElementById('btn-back-to-menu-song'),
    keybindBtns: document.querySelectorAll('.keybind-btn')
};

// Lane configurations for key bindings and drawing
const laneKeys = {
    0: { key: 'a', color: '#33ff66', targetEl: document.getElementById('target-0') },
    1: { key: 's', color: '#ffcc00', targetEl: document.getElementById('target-1') },
    2: { key: 'd', color: '#ff3366', targetEl: document.getElementById('target-2') },
    3: { key: 'k', color: '#00ccff', targetEl: document.getElementById('target-3') },
    4: { key: 'l', color: '#ff7700', targetEl: document.getElementById('target-4') }
};

// Key configurations for special skills
const specialKeys = {
    individual: { key: ' ' },
    band: { key: 'enter' }
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
    const songId = state.selectedSong || 'song1';
    
    // Map UI classes to standardized chart instruments
    const instrumentMap = {
        'solo': 'lead_guitar',
        'rhythm': 'rhythm_guitar',
        'bass': 'bass',
        'drums': 'drums'
    };
    
    const instrumentId = instrumentMap[classType] || classType;
    
    // 1. Check if we have a static chart loaded in SONGS_CHARTS for this song and instrument and selected difficulty
    const songChart = typeof SONGS_CHARTS !== 'undefined' ? SONGS_CHARTS[songId] : null;
    const instrumentChart = songChart?.instruments?.[instrumentId];
    
    const difficulty = state.selectedDifficulty || 'normal';
    let chartNotes = null;
    let loadedDifficulty = difficulty;
    
    if (instrumentChart) {
        if (instrumentChart[difficulty] && Array.isArray(instrumentChart[difficulty].notes)) {
            chartNotes = instrumentChart[difficulty].notes;
            loadedDifficulty = difficulty;
        } else if (instrumentChart['normal'] && Array.isArray(instrumentChart['normal'].notes)) {
            chartNotes = instrumentChart['normal'].notes;
            loadedDifficulty = 'normal';
        } else if (instrumentChart['easy'] && Array.isArray(instrumentChart['easy'].notes)) {
            chartNotes = instrumentChart['easy'].notes;
            loadedDifficulty = 'easy';
        } else if (Array.isArray(instrumentChart.notes)) {
            chartNotes = instrumentChart.notes;
            loadedDifficulty = 'normal';
        }
    }
    
    if (chartNotes) {
        console.log(`Loaded static chart: ${songId} ${instrumentId} ${loadedDifficulty} ${chartNotes.length}`);
        
        // 2. Create deep copy/clone of raw notes
        const clonedNotes = chartNotes.map(note => ({
            time: note.time,
            lane: note.lane,
            duration: note.duration || 0,
            type: note.type || "tap",
            intensity: note.intensity || 0.8,
            hit: false,       // gameplay status added in runtime
            missed: false     // gameplay status added in runtime
        }));
        
        // 3. Sort chronologically by time
        clonedNotes.sort((a, b) => a.time - b.time);
        
        state.totalNotes = clonedNotes.length;
        return clonedNotes;
    }
    
    // 4. Fallback procedimental/aleatório antigo caso não exista chart estruturado
    console.log(`Usando gerador procedimental (fallback) para ${songId} (${classType})`);
    
    const chart = [];
    const song = SONGS_DATABASE[songId];
    
    const beatInterval = 60 / song.bpm; // e.g. 0.5s for 120bpm
    const totalDuration = 180; // up to 3 minutes
    
    let time = 3.0; // start after 3s
    
    // Californication (BPM 96)
    if (songId === 'song2') {
        if (classType === 'bass') {
            // Californication Bass: Flea's iconic alternating intro/verse riff
            while (time < totalDuration - 2) {
                const section = Math.floor(time / 15); // sections of 15s
                
                if (section % 4 === 2) {
                    // Chorus (active/heavy)
                    chart.push({ time: time, lane: 0, hit: false, missed: false });
                    chart.push({ time: time + beatInterval * 0.5, lane: 2, hit: false, missed: false });
                    chart.push({ time: time + beatInterval, lane: 1, hit: false, missed: false });
                    chart.push({ time: time + beatInterval * 1.5, lane: 2, hit: false, missed: false });
                    time += beatInterval * 2;
                } else {
                    // Intro/Verse: steady alternating syncopated groove
                    chart.push({ time: time, lane: 0, hit: false, missed: false }); // A
                    chart.push({ time: time + beatInterval * 0.75, lane: 1, hit: false, missed: false }); // S (syncopated eighth)
                    chart.push({ time: time + beatInterval * 1.5, lane: 0, hit: false, missed: false }); // A
                    chart.push({ time: time + beatInterval * 2.25, lane: 1, hit: false, missed: false }); // S
                    time += beatInterval * 3;
                }
            }
        } else if (classType === 'solo') {
            // Californication Solo Guitar: melodic and sparse, with slow sustains in the solo bridge
            while (time < totalDuration - 2) {
                const section = Math.floor(time / 15);
                const isSoloBridge = (section === 5 || section === 6); // solo bridge section (75s - 105s)
                
                if (isSoloBridge) {
                    // Slow bends / vibrates with sustain!
                    chart.push({ time: time, lane: 2, duration: 1.5, hit: false, missed: false });
                    chart.push({ time: time + beatInterval * 3, lane: 3, duration: 1.0, hit: false, missed: false });
                    chart.push({ time: time + beatInterval * 5, lane: 4, duration: 1.5, hit: false, missed: false });
                    time += beatInterval * 8;
                } else {
                    // Regular verse/intro: sparse notes (clean guitar fills)
                    if (Math.random() < 0.4) {
                        chart.push({ time: time, lane: 3, hit: false, missed: false });
                    }
                    time += beatInterval * 4;
                }
            }
        } else if (classType === 'rhythm') {
            // Californication Rhythm Guitar: chords marked on downbeats
            while (time < totalDuration - 2) {
                const section = Math.floor(time / 15);
                const isVerse = (section % 4 === 1 || section % 4 === 3);
                const isChorus = (section % 4 === 2);
                
                if (isChorus) {
                    // Full strumming chords on every beat
                    chart.push({ time: time, lane: 1, hit: false, missed: false });
                    chart.push({ time: time, lane: 3, hit: false, missed: false });
                    time += beatInterval;
                } else if (isVerse) {
                    // Chord on beat 1 of every 2 measures
                    chart.push({ time: time, lane: 1, duration: 1.5, hit: false, missed: false });
                    chart.push({ time: time, lane: 4, duration: 1.5, hit: false, missed: false });
                    time += beatInterval * 4;
                } else {
                    time += beatInterval * 2;
                }
            }
        } else if (classType === 'drums') {
            // Californication Drums: steady standard rock groove
            while (time < totalDuration - 2) {
                const beatNum = Math.floor(time / beatInterval);
                
                // Kick on 1
                if (beatNum % 2 === 0) {
                    chart.push({ time: time, lane: 0, hit: false, missed: false });
                }
                // Snare on 2
                if (beatNum % 2 === 1) {
                    chart.push({ time: time, lane: 2, hit: false, missed: false });
                }
                // Steady hihat
                chart.push({ time: time, lane: 3, hit: false, missed: false });
                chart.push({ time: time + beatInterval / 2, lane: 3, hit: false, missed: false });
                
                time += beatInterval;
            }
        }
    }
    // Hellraiser (BPM 137)
    else if (songId === 'song3') {
        if (classType === 'solo') {
            // Hellraiser Solo Guitar: fast metal shred scale runs
            while (time < totalDuration - 2) {
                const section = Math.floor(time / 15);
                const isSoloSection = (section === 4 || section === 5 || section === 8); // solo sections
                
                if (isSoloSection) {
                    // Aggressive scale descents / ascents
                    const count = 8;
                    for (let i = 0; i < count; i++) {
                        chart.push({ time: time + (i * beatInterval / 4), lane: i % 5, hit: false, missed: false });
                    }
                    // Final sustain bend
                    chart.push({ time: time + (count * beatInterval / 4), lane: 4, duration: 1.2, hit: false, missed: false });
                    time += beatInterval * 6;
                } else {
                    // Fast rock riffs
                    chart.push({ time: time, lane: Math.floor(Math.random() * 5), hit: false, missed: false });
                    if (Math.random() < 0.5) {
                        chart.push({ time: time + beatInterval / 2, lane: Math.floor(Math.random() * 5), hit: false, missed: false });
                    }
                    time += beatInterval;
                }
            }
        } else if (classType === 'rhythm') {
            // Hellraiser Rhythm Guitar: heavy repeating power metal chords on the beat
            while (time < totalDuration - 2) {
                chart.push({ time: time, lane: 1, hit: false, missed: false });
                chart.push({ time: time, lane: 2, hit: false, missed: false });
                
                if (Math.random() < 0.3) {
                    // Fast double hit
                    chart.push({ time: time + beatInterval / 2, lane: 1, hit: false, missed: false });
                    chart.push({ time: time + beatInterval / 2, lane: 2, hit: false, missed: false });
                }
                time += beatInterval;
            }
        } else if (classType === 'bass') {
            // Hellraiser Bass: fast pumping eighth notes
            while (time < totalDuration - 2) {
                chart.push({ time: time, lane: 0, hit: false, missed: false });
                chart.push({ time: time + beatInterval / 2, lane: 1, hit: false, missed: false });
                time += beatInterval;
            }
        } else if (classType === 'drums') {
            // Hellraiser Drums: fast metal double bass beat
            while (time < totalDuration - 2) {
                const beatNum = Math.floor(time / beatInterval);
                
                // Double bass bumbo
                chart.push({ time: time, lane: 0, hit: false, missed: false });
                chart.push({ time: time + beatInterval / 2, lane: 0, hit: false, missed: false });
                
                // Snare on beat 2
                if (beatNum % 2 === 1) {
                    chart.push({ time: time, lane: 2, hit: false, missed: false });
                }
                
                // Ride hihat
                chart.push({ time: time, lane: 3, hit: false, missed: false });
                
                // Crash on lane 4 every 4 beats
                if (beatNum % 4 === 0) {
                    chart.push({ time: time, lane: 4, hit: false, missed: false });
                }
                time += beatInterval;
            }
        }
    }
    // Ride Like The Wind (BPM 125)
    else {
        // General rock patterns for Jorn's track
        if (classType === 'solo') {
            while (time < totalDuration - 2) {
                const isSolo = (Math.floor(time / 10) % 3 === 0);
                if (isSolo) {
                    let lane = 0;
                    for (let i = 0; i < 6; i++) {
                        chart.push({ time: time + i * beatInterval / 2, lane: lane, hit: false, missed: false });
                        lane = (lane + 1) % 5;
                    }
                    time += beatInterval * 4;
                } else {
                    chart.push({ time: time, lane: Math.floor(Math.random() * 5), hit: false, missed: false });
                    if (Math.random() < 0.3) {
                        chart.push({ time: time + beatInterval / 2, lane: Math.floor(Math.random() * 5), hit: false, missed: false });
                    }
                    time += beatInterval;
                }
            }
        } else if (classType === 'rhythm') {
            while (time < totalDuration - 2) {
                chart.push({ time: time, lane: 1, hit: false, missed: false });
                chart.push({ time: time, lane: 3, hit: false, missed: false });
                if (Math.random() < 0.4) {
                    chart.push({ time: time + beatInterval / 2, lane: 2, hit: false, missed: false });
                }
                time += beatInterval * (Math.random() > 0.7 ? 2 : 1);
            }
        } else if (classType === 'bass') {
            let lane = 0;
            while (time < totalDuration - 2) {
                chart.push({ time: time, lane: lane, hit: false, missed: false });
                lane = lane === 0 ? 1 : 0;
                time += beatInterval;
            }
        } else if (classType === 'drums') {
            while (time < totalDuration - 2) {
                const beatNum = Math.floor(time / beatInterval);
                if (beatNum % 2 === 0) {
                    chart.push({ time: time, lane: 0, hit: false, missed: false });
                } else {
                    chart.push({ time: time, lane: 1, hit: false, missed: false });
                }
                chart.push({ time: time, lane: 3, hit: false, missed: false });
                chart.push({ time: time + beatInterval / 2, lane: 3, hit: false, missed: false });
                time += beatInterval;
            }
        }
    }
    
    // Sort and return
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
    els.songScreen.className = screenId === 'song-screen' ? 'active-screen' : 'hidden-screen';
    els.classScreen.className = screenId === 'class-screen' ? 'active-screen' : 'hidden-screen';
    els.gameScreen.className = screenId === 'game-screen' ? 'active-screen' : 'hidden-screen';
    els.resultsScreen.className = screenId === 'results-screen' ? 'active-screen' : 'hidden-screen';

    // Handle background cinematic videos depending on the screen
    if (screenId === 'menu-screen' || screenId === 'song-screen') {
        if (!els.bgVideo.src.includes("assets/videos/Game_trailer_intro_stadium_202606151550.mp4")) {
            els.bgVideo.src = "assets/videos/Game_trailer_intro_stadium_202606151550.mp4";
            els.bgVideo.load();
            els.bgVideo.play().catch(e => console.log("Autoplay blocked: user must click first."));
        }
    } else if (screenId === 'game-screen') {
        let videoSrc = "assets/videos/Rocker_shreds_guitar_solo_stage_202606151550.mp4";
        if (state.selectedClass === 'solo') videoSrc = "assets/videos/guitar.mp4";
        else if (state.selectedClass === 'rhythm') videoSrc = "assets/videos/base guitar.mp4";
        else if (state.selectedClass === 'bass') videoSrc = "assets/videos/bass.mp4";
        else if (state.selectedClass === 'drums') videoSrc = "assets/videos/drums.mp4";
        
        els.bgVideo.src = videoSrc;
        els.bgVideo.load();
        // Video playing is managed by startSong() inside game loop to guarantee sync
    } else if (screenId === 'results-screen') {
        els.bgVideo.src = "assets/videos/Band_battle_epic_finale_victory_202606151550.mp4";
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
// METRONOME SYNTHESIZER (WEB AUDIO API)
// ----------------------------------------------------
let audioCtx = null;
function playMetronomeClick(frequency = 1000, duration = 0.08, volume = 1.0) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        osc.type = 'sine';
        
        // Short exponential decay click
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.warn("Failed to play metronome click via Web Audio API:", e);
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
    els.gameScreen.classList.add('intro-active');
    setupCanvas();
    
    // Reset Stats
    state.playerScore = 0;
    state.rivalScore = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.notesHit = 0;
    state.notesMissed = 0;
    state.accuracy = 100;
    state.crowdDominance = 50;
    state.specialEnergy = 0;
    state.holdingNotes = [null, null, null, null, null];
    state.specialActive = false;
    state.comboShieldHits = 0;
    state.grooveAnchorActive = false;
    
    // Collective Band Showtime & Trackers Reset
    state.bandEnergy = 0;
    state.bandShowtimeActive = false;
    state.individualAbilityUsed = false;
    state.bandShowtimeUsed = false;
    
    state.rival = {
        score: 0,
        combo: 0,
        maxCombo: 0,
        accuracy: 100,
        notesHit: 0,
        totalNotes: 0,
        lastProcessedSecond: -1
    };
    
    els.playerScoreTxt.innerText = "000,000";
    els.rivalScoreTxt.innerText = "000,000";
    updateTugOfWarUI();
    updateComboUI();
    updateSpecialUI();
    updateBandSpecialUI();
    
    // Reset arena overlay classes
    if (els.arenaDominanceOverlay) {
        els.arenaDominanceOverlay.className = '';
    }
    
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
    const songData = SONGS_DATABASE[state.selectedSong || 'song1'];
    els.gameAudio.src = songData.file;
    els.gameAudio.volume = 0.8;
    
        // Dynamically adjust global BPM configuration to match the song
    GAME_CFG.bpm = songData.bpm;
    
    // Preload special video
    els.specialVideo.src = "assets/videos/full band.mp4";
    els.specialVideo.load();
    els.specialVideo.muted = true;
    els.specialVideo.currentTime = 0;
    els.specialVideo.style.display = 'none';
    els.specialVideo.style.opacity = '0';
    
    // Clean up any existing ended listener on bgVideo
    if (state.introEndedListener) {
        els.bgVideo.removeEventListener('ended', state.introEndedListener);
        state.introEndedListener = null;
    }
    
    // Schedule countdown numbers before the first note
    const firstNote = state.notes.find(n => !n.hit && !n.missed);
    const firstNoteTime = firstNote ? firstNote.time : 3.0;
    const beatInterval = 60 / GAME_CFG.bpm;
    
    state.metronomeClicks = [
        firstNoteTime - 4 * beatInterval,
        firstNoteTime - 3 * beatInterval,
        firstNoteTime - 2 * beatInterval,
        firstNoteTime - 1 * beatInterval,
        firstNoteTime
    ];
    state.metronomeClicksPlayed = [false, false, false, false, false];

    // Play intro video clip with audio
    console.log("Playing intro video: assets/videos/intro.mp4");
    els.bgVideo.src = "assets/videos/intro.mp4";
    els.bgVideo.muted = false; // play with sound!
    els.bgVideo.loop = false;
    els.bgVideo.currentTime = 0;
    els.bgVideo.load();
    
    const onIntroVideoEnded = () => {
        console.log("Intro video ended. Starting song and gameplay.");
        els.bgVideo.removeEventListener('ended', onIntroVideoEnded);
        state.introEndedListener = null;
        
        // Switch to looping instrument video
        let videoSrc = "assets/videos/Rocker_shreds_guitar_solo_stage_202606151550.mp4";
        if (state.selectedClass === 'solo') videoSrc = "assets/videos/guitar.mp4";
        else if (state.selectedClass === 'rhythm') videoSrc = "assets/videos/base guitar.mp4";
        else if (state.selectedClass === 'bass') videoSrc = "assets/videos/bass.mp4";
        else if (state.selectedClass === 'drums') videoSrc = "assets/videos/drums.mp4";
        
        els.bgVideo.src = videoSrc;
        els.bgVideo.muted = true;
        els.bgVideo.loop = true;
        els.bgVideo.load();
        els.bgVideo.play().catch(e => console.warn("Muted background video blocked:", e));
        
        // Play song audio
        els.gameAudio.play()
            .then(() => {
                console.log(`${songData.file} carregada e tocando com sucesso!`);
                if (DEBUG_DEMO_BATTLE) {
                    console.log("Rival performance started");
                }
                state.isLoopRunning = true;
                rhythmLoop();
            })
            .catch(err => {
                console.warn(`${songData.file} autoplay bloqueado. Rodando jogo silencioso...`, err);
                if (DEBUG_DEMO_BATTLE) {
                    console.log("Rival performance started");
                }
                state.isLoopRunning = true;
                rhythmLoop();
            });
            
        // Wait about 1 second after starting song before showing HUD and board
        state.introActiveTimeout = setTimeout(() => {
            els.gameScreen.classList.remove('intro-active');
            state.introActiveTimeout = null;
        }, 1000);
    };
    
    state.introEndedListener = onIntroVideoEnded;
    els.bgVideo.addEventListener('ended', onIntroVideoEnded);
    
    els.bgVideo.play().catch(e => {
        console.warn("Autoplay blocked intro.mp4. Skipping directly to gameplay.", e);
        onIntroVideoEnded();
    });
}

function stopGameplay() {
    state.isLoopRunning = false;
    els.gameScreen.classList.remove('intro-active');
    
    if (els.gameStartCountdown) {
        els.gameStartCountdown.innerText = "";
        els.gameStartCountdown.classList.remove('pop');
    }
    
    if (state.introActiveTimeout) {
        clearTimeout(state.introActiveTimeout);
        state.introActiveTimeout = null;
    }
    
    // Clean up ended listener
    if (state.introEndedListener) {
        els.bgVideo.removeEventListener('ended', state.introEndedListener);
        state.introEndedListener = null;
    }
    
    els.bgVideo.pause();
    els.specialVideo.pause();
    els.gameAudio.pause();
    if (state.specialTimer) clearTimeout(state.specialTimer);
    if (state.bandShowtimeTimer) clearTimeout(state.bandShowtimeTimer);
    if (els.arenaDominanceOverlay) els.arenaDominanceOverlay.className = '';
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
    // Play visual countdown pop on screen before notes start
    if (state.metronomeClicks && state.metronomeClicksPlayed) {
        for (let i = 0; i < state.metronomeClicks.length; i++) {
            if (!state.metronomeClicksPlayed[i] && currentAudioTime >= state.metronomeClicks[i]) {
                state.metronomeClicksPlayed[i] = true;
                
                if (els.gameStartCountdown) {
                    els.gameStartCountdown.classList.remove('pop');
                    void els.gameStartCountdown.offsetWidth; // Trigger reflow to restart CSS animation
                    
                    if (i === 4) {
                        els.gameStartCountdown.innerText = "ROCK!";
                        els.gameStartCountdown.classList.add('pop');
                        setTimeout(() => {
                            if (els.gameStartCountdown.innerText === "ROCK!") {
                                els.gameStartCountdown.innerText = "";
                                els.gameStartCountdown.classList.remove('pop');
                            }
                        }, 500);
                    } else {
                        els.gameStartCountdown.innerText = 4 - i;
                        els.gameStartCountdown.classList.add('pop');
                    }
                }
            }
        }
    }
    
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
            
            // Hold energy charge
            if (!state.specialActive) {
                const oldEnergy = state.specialEnergy;
                let holdCharge = 0.2;
                if (state.selectedClass === 'drums') holdCharge *= 2.0;
                state.specialEnergy = Math.min(100, state.specialEnergy + holdCharge);
                updateSpecialUI();
                if (oldEnergy < 100 && state.specialEnergy >= 100) {
                    if (DEBUG_DEMO_BATTLE) {
                        console.log("Individual ability charged");
                    }
                }
            }
            if (!state.bandShowtimeActive) {
                const oldBandEnergy = state.bandEnergy;
                const bandHoldCharge = state.specialActive ? 0.15 : 0.08;
                state.bandEnergy = Math.min(100, state.bandEnergy + bandHoldCharge);
                updateBandSpecialUI();
                if (oldBandEnergy < 100 && state.bandEnergy >= 100) {
                    if (DEBUG_DEMO_BATTLE) {
                        console.log("Band Showtime charged");
                    }
                }
            }
            
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
        updateRivalSimulation(matchTime);
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
    let scoreMult = 1;
    if (state.combo >= 40) scoreMult = 4;
    else if (state.combo >= 25) scoreMult = 3;
    else if (state.combo >= 10) scoreMult = 2;
    
    // Class modifiers
    let scoreBase = GAME_CFG.scorePerfect;
    if (precision === 'good') scoreBase = GAME_CFG.scoreGood;
    else if (precision === 'ok') scoreBase = GAME_CFG.scoreOk;
    
    // Guitarrista Solo (DPS) gives double points during special blitz
    let classBonus = 1.0;
    if (state.selectedClass === 'solo' && state.specialActive) {
        classBonus = 2.0;
    }
    
    const pointsGained = Math.round(scoreBase * scoreMult * classBonus);
    state.playerScore += pointsGained;
    els.playerScoreTxt.innerText = formatScore(state.playerScore);
    
    // Combo increment
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    
    // Charge Special meter (Individual ability: Destaque Individual)
    let chargeSpeed = 3; // good default
    if (precision === 'perfect') chargeSpeed = 4;
    else if (precision === 'ok') chargeSpeed = 1.5;

    if (state.selectedClass === 'drums') {
        chargeSpeed *= 2.0; // Drums energy generation bonus
    }
    
    if (!state.specialActive) {
        const oldEnergy = state.specialEnergy;
        state.specialEnergy = Math.min(100, state.specialEnergy + chargeSpeed);
        
        // Add combo milestone bonus (+5% every 10 combo hits)
        if (state.combo > 0 && state.combo % 10 === 0) {
            state.specialEnergy = Math.min(100, state.specialEnergy + 5);
        }

        if (oldEnergy < 100 && state.specialEnergy >= 100) {
            if (DEBUG_DEMO_BATTLE) {
                console.log("Individual ability charged");
            }
        }
    }

    // Charge Band collective meter
    if (!state.bandShowtimeActive) {
        let bandCharge = state.specialActive ? 1.0 : 0.5;

        // Combo bonus
        if (state.combo >= 40) bandCharge += 5.0;
        else if (state.combo >= 25) bandCharge += 3.0;
        else if (state.combo >= 10) bandCharge += 1.5;

        // Hit streak bonus (+5% every 10 notes hit)
        if (state.notesHit > 0 && state.notesHit % 10 === 0) {
            bandCharge += 5.0;
        }

        const oldBandEnergy = state.bandEnergy;
        state.bandEnergy = Math.min(100, state.bandEnergy + bandCharge);
        updateBandSpecialUI();

        if (oldBandEnergy < 100 && state.bandEnergy >= 100) {
            if (DEBUG_DEMO_BATTLE) {
                console.log("Band Showtime charged");
            }
        }
    }
    
    // Push Crowd Dominance (towards player/Red)
    let basePush = 1.5;
    if (precision === 'perfect') basePush = 2.5;
    else if (precision === 'ok') basePush = 0.8;

    let comboMult = 1.0;
    if (state.combo >= 40) comboMult = 2.0;
    else if (state.combo >= 25) comboMult = 1.5;
    else if (state.combo >= 10) comboMult = 1.25;

    let skillMult = state.specialActive ? 2.0 : 1.0;
    let showtimeMult = state.bandShowtimeActive ? 2.0 : 1.0;

    const maxDominanceMultiplier = 4.0;
    const finalMult = Math.min(comboMult * skillMult * showtimeMult, maxDominanceMultiplier);

    let pushClassBonus = 1.0;
    if (state.selectedClass === 'solo') pushClassBonus = 1.25;

    const pushValue = basePush * finalMult * pushClassBonus;
    adjustDominance(pushValue);
    
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
    
    // Deduct player special energy
    if (!state.specialActive) {
        state.specialEnergy = Math.max(0, state.specialEnergy - 10);
        updateSpecialUI();
    }
    
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
        
        // Push crowd dominance right (rival gain)
        // Rhythm class reduces loss
        let pullFactor = 4.0;
        if (state.selectedClass === 'rhythm') pullFactor = 2.0;
        adjustDominance(-pullFactor);
        
        updateComboUI();
    }
    
    calculateAccuracy();
}

function triggerSpecialSkill() {
    if (state.specialEnergy < 100 || state.specialActive || !state.isLoopRunning) return;
    
    state.specialActive = true;
    state.specialEnergy = 0;
    state.individualAbilityUsed = true;
    
    if (DEBUG_DEMO_BATTLE) {
        console.log("Individual ability activated");
    }

    // Charge Band Energy by +15% immediately
    if (!state.bandShowtimeActive) {
        const oldBandEnergy = state.bandEnergy;
        state.bandEnergy = Math.min(100, state.bandEnergy + 15);
        updateBandSpecialUI();
        if (oldBandEnergy < 100 && state.bandEnergy >= 100) {
            if (DEBUG_DEMO_BATTLE) {
                console.log("Band Showtime charged");
            }
        }
    }

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
    els.skillBannerText.innerText = "DESTAQUE INDIVIDUAL!";
    
    // Remove banner class after animation ends
    setTimeout(() => {
        els.skillBannerText.classList.remove('show');
    }, 1500);
    
    // Skill duration timer (7 seconds)
    state.specialTimer = setTimeout(() => {
        state.specialActive = false;
        state.grooveAnchorActive = false;
        if (!state.bandShowtimeActive) {
            els.skillOverlay.classList.remove('active');
        }
        updateSpecialUI();
        updateArenaVisuals();
        
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
    updateArenaVisuals();
}

function triggerBandShowtime() {
    if (state.bandEnergy < 100 || state.bandShowtimeActive || !state.isLoopRunning) return;

    state.bandShowtimeActive = true;
    state.bandEnergy = 0;
    state.bandShowtimeUsed = true;

    if (DEBUG_DEMO_BATTLE) {
        console.log("Band Showtime activated");
    }

    // Show banner in HUD
    els.skillOverlay.classList.add('active');
    els.skillBannerText.classList.add('show');
    els.skillBannerText.innerText = "SHOWTIME!";

    setTimeout(() => {
        els.skillBannerText.classList.remove('show');
    }, 1500);

    // Timer for 10 seconds
    state.bandShowtimeTimer = setTimeout(() => {
        state.bandShowtimeActive = false;
        if (!state.specialActive) {
            els.skillOverlay.classList.remove('active');
        }
        updateBandSpecialUI();
        updateArenaVisuals();
    }, 10000);

    updateBandSpecialUI();
    updateArenaVisuals();
}

// Keyboard Listeners
window.addEventListener('keydown', (e) => {
    // Check if we are waiting to map a key for a lane or special
    if (state.waitingForKeyForLane !== null) {
        e.preventDefault();
        const key = e.key.toLowerCase();
        
        // Prevent escape (reserved to cancel/exit)
        if (key === 'escape') {
            state.waitingForKeyForLane = null;
            updateKeybindingsUI();
            return;
        }
        
        const target = state.waitingForKeyForLane;
        
        // Prevent duplicate mapping
        let alreadyBound = false;
        
        // Check lanes
        for (let i = 0; i < 5; i++) {
            if (target !== i && laneKeys[i].key === key) {
                alreadyBound = true;
            }
        }
        // Check specials
        if (target !== 'special_individual' && specialKeys.individual.key === key) {
            alreadyBound = true;
        }
        if (target !== 'special_band' && specialKeys.band.key === key) {
            alreadyBound = true;
        }
        
        if (alreadyBound) {
            alert(`A tecla '${key === ' ' ? 'ESPAÇO' : key.toUpperCase()}' já está mapeada!`);
            state.waitingForKeyForLane = null;
            updateKeybindingsUI();
            return;
        }
        
        // Assign new key, persist, and update UI
        if (typeof target === 'number') {
            laneKeys[target].key = key;
            localStorage.setItem(`rockarena_key_${target}`, key);
        } else if (target === 'special_individual') {
            specialKeys.individual.key = key;
            localStorage.setItem(`rockarena_key_special_individual`, key);
        } else if (target === 'special_band') {
            specialKeys.band.key = key;
            localStorage.setItem(`rockarena_key_special_band`, key);
        }
        
        updateKeybindingsUI();
        state.waitingForKeyForLane = null;
        return;
    }

    if (state.currentScreen !== 'game-screen' || e.repeat) return;
    
    const key = e.key.toLowerCase();
    
    if (key === 'escape') {
        stopGameplay();
        showScreen('menu-screen');
        return;
    }
    
    if (key === specialKeys.individual.key) {
        if (state.isLoopRunning) {
            e.preventDefault();
            triggerSpecialSkill();
        }
        return;
    }
    
    if (key === specialKeys.band.key) {
        if (state.isLoopRunning) {
            e.preventDefault();
            triggerBandShowtime();
        }
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
            if (DEBUG_DEMO_BATTLE) {
                console.log(`Gamepad Button Pressed: index ${btnIndex} (Lane ${lane})`);
            }
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
    
    // Special skill activation: L1 / R1 (Destaque Individual)
    const specialPressed = currentBtnState[4] || currentBtnState[5]; // L1 or R1
    const specialWasPressed = state.lastGamepadButtonState[4] || state.lastGamepadButtonState[5];
    
    if (specialPressed && !specialWasPressed) {
        if (DEBUG_DEMO_BATTLE) {
            console.log("Gamepad Special Button (L1/R1) pressed");
        }
        triggerSpecialSkill();
    }

    // Showtime activation: L2 / R2
    const showtimePressed = currentBtnState[6] || currentBtnState[7]; // L2 or R2
    const showtimeWasPressed = state.lastGamepadButtonState[6] || state.lastGamepadButtonState[7];

    if (showtimePressed && !showtimeWasPressed) {
        if (DEBUG_DEMO_BATTLE) {
            console.log("Gamepad Showtime Button (L2/R2) pressed");
        }
        triggerBandShowtime();
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

function adjustDominance(amount) {
    state.crowdDominance = Math.max(0, Math.min(100, state.crowdDominance + amount));
    updateTugOfWarUI();
}

function updateTugOfWarUI() {
    // 100 is Player/Red (Jax's Band), 0 is Rival/Blue (Shred Rivals).
    // The marker is positioned left-to-right (0% left is Red, 100% left is Blue).
    const markerPosition = 100 - state.crowdDominance;
    els.tugBarMarker.style.left = `${markerPosition}%`;
    
    // Percentage display
    const redPct = Math.round(state.crowdDominance);
    const bluePct = 100 - redPct;
    if (els.tugBarLabel) {
        els.tugBarLabel.innerText = `VERMELHO: ${redPct}% | AZUL: ${bluePct}%`;
    }

    if (state.crowdDominance > 55) {
        els.tugStatus.innerText = "DOMÍNIO DA SUA BANDA!";
        els.tugStatus.className = "tug-status-text text-neon-red";
    } else if (state.crowdDominance < 45) {
        els.tugStatus.innerText = "RIVAIS DOMINANDO!";
        els.tugStatus.className = "tug-status-text text-neon-blue";
    } else {
        els.tugStatus.innerText = "Batalha Equilibrada";
        els.tugStatus.className = "tug-status-text";
    }

    updateArenaVisuals();
}

function updateArenaVisuals() {
    if (!els.arenaDominanceOverlay) return;
    
    if (state.currentScreen !== 'game-screen') {
        els.arenaDominanceOverlay.className = '';
        return;
    }

    els.arenaDominanceOverlay.classList.add('active');

    // Remove status classes first
    els.arenaDominanceOverlay.classList.remove('red-winning', 'blue-winning', 'balanced', 'special-active', 'showtime-active');

    // Priority: Showtime active (strong Red) > Destaque Individual active (Gold) > normal dominance status
    if (state.bandShowtimeActive) {
        els.arenaDominanceOverlay.classList.add('showtime-active');
    } else if (state.specialActive) {
        els.arenaDominanceOverlay.classList.add('special-active');
    } else {
        if (state.crowdDominance > 55) {
            els.arenaDominanceOverlay.classList.add('red-winning');
        } else if (state.crowdDominance < 45) {
            els.arenaDominanceOverlay.classList.add('blue-winning');
        } else {
            els.arenaDominanceOverlay.classList.add('balanced');
        }
    }
}

function updateBandSpecialUI() {
    if (!els.bandBarFill) return;
    els.bandBarFill.style.width = `${state.bandEnergy}%`;

    if (state.bandShowtimeActive) {
        els.bandBarFill.classList.add('ready');
        els.bandBarFill.style.width = '100%';
        if (els.bandHint) els.bandHint.classList.remove('show');
    } else if (state.bandEnergy >= 100) {
        els.bandBarFill.classList.add('ready');
        if (els.bandHint) els.bandHint.classList.add('show');
    } else {
        els.bandBarFill.classList.remove('ready');
        if (els.bandHint) els.bandHint.classList.remove('show');
    }
}

function updateRivalSimulation(matchTime) {
    if (!state.isLoopRunning || matchTime <= 0.5) return;

    const currentSecond = Math.floor(matchTime);
    if (currentSecond <= state.rival.lastProcessedSecond) return;

    state.rival.lastProcessedSecond = currentSecond;
    state.rival.totalNotes++; // simulate one note target per second

    // Scale performance by difficulty
    let hitChance = 0.88; // Normal default
    let basePoints = 1000;
    let baseTugPull = 1.0;

    const difficulty = state.selectedDifficulty || 'normal';
    if (difficulty === 'easy') {
        hitChance = 0.80;
        basePoints = 600;
        baseTugPull = 0.6;
    } else if (difficulty === 'normal') {
        hitChance = 0.88;
        basePoints = 1000;
        baseTugPull = 1.0;
    } else if (difficulty === 'hard') {
        hitChance = 0.93;
        basePoints = 1500;
        baseTugPull = 1.5;
    } else if (difficulty === 'expert') {
        hitChance = 0.97;
        basePoints = 2200;
        baseTugPull = 2.2;
    }

    // Performance variation factor (variationFactor between 0.80 and 1.20)
    // Sine wave over time + slight random variation
    const variationFactor = 1.0 + 0.15 * Math.sin(currentSecond / 8) + (Math.random() * 0.1 - 0.05);
    const clampedVariation = Math.max(0.80, Math.min(1.20, variationFactor));

    // Determine if rival hit the note
    const hit = Math.random() < hitChance;

    if (hit) {
        state.rival.notesHit++;
        state.rival.combo++;
        if (state.rival.combo > state.rival.maxCombo) {
            state.rival.maxCombo = state.rival.combo;
        }

        // Rival combo multiplier
        let rivalMult = 1;
        if (state.rival.combo >= 40) rivalMult = 4;
        else if (state.rival.combo >= 25) rivalMult = 3;
        else if (state.rival.combo >= 10) rivalMult = 2;

        // Points generated
        const ptsGained = Math.round(basePoints * rivalMult * clampedVariation);
        state.rivalScore += ptsGained;
        state.rival.score = state.rivalScore;
        els.rivalScoreTxt.innerText = formatScore(state.rivalScore);

        // Tug of war pull (decreases dominance, pushing to Blue / Rival)
        // Groove Anchor reduces rival pull by 50% to 70% (we use 60% reduction -> pull is 40% of normal)
        let grooveReduction = 1.0;
        if (state.grooveAnchorActive) {
            grooveReduction = 0.4;
        }

        // Showtime reduces rival pull by 60% (pull is 40% of normal)
        let showtimeReduction = 1.0;
        if (state.bandShowtimeActive) {
            showtimeReduction = 0.4;
        }

        const pullAmount = baseTugPull * clampedVariation * grooveReduction * showtimeReduction;
        adjustDominance(-pullAmount);
    } else {
        // Miss breaks rival combo
        state.rival.combo = 0;
    }

    // Recalculate rival accuracy
    state.rival.accuracy = Math.round((state.rival.notesHit / state.rival.totalNotes) * 100);

    // Logging Crowd dominance
    if (DEBUG_DEMO_BATTLE) {
        const redPct = Math.round(state.crowdDominance);
        const bluePct = 100 - redPct;
        console.log(`Crowd dominance: Red ${redPct}%, Blue ${bluePct}%`);
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
    
    // Decide winner (Scale: 0 is Blue/Rival, 100 is Red/Player. Red wins if crowdDominance >= 50)
    const playerWon = state.crowdDominance >= 50;
    
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
    
    // Demo 01 Stats mapping
    if (els.resWinnerBand) {
        els.resWinnerBand.innerText = playerWon ? "Banda Vermelha (Jax's Band)" : "Banda Azul (Shred Rivals)";
        els.resWinnerBand.className = playerWon ? "stat-value text-neon-red" : "stat-value text-neon-blue";
    }
    if (els.resFinalDominance) {
        els.resFinalDominance.innerText = `Vermelho: ${Math.round(state.crowdDominance)}% | Azul: ${Math.round(100 - state.crowdDominance)}%`;
    }
    if (els.resIndSkillUsed) {
        els.resIndSkillUsed.innerText = state.individualAbilityUsed ? "Sim" : "Não";
    }
    if (els.resShowtimeUsed) {
        els.resShowtimeUsed.innerText = state.bandShowtimeUsed ? "Sim" : "Não";
    }

    if (DEBUG_DEMO_BATTLE) {
        console.log(`Final winner: ${playerWon ? "Red" : "Blue"}`);
    }
    
    showScreen('results-screen');
}

// ----------------------------------------------------
// KEYBOARD REBINDING LOGIC
// ----------------------------------------------------
function getKeyDisplayName(key) {
    if (key === ' ') return 'ESPAÇO';
    if (key === 'enter') return 'ENTER';
    return key.toUpperCase();
}

function loadKeybindings() {
    for (let i = 0; i < 5; i++) {
        const savedKey = localStorage.getItem(`rockarena_key_${i}`);
        if (savedKey) {
            laneKeys[i].key = savedKey;
        }
    }
    const savedSpecialInd = localStorage.getItem('rockarena_key_special_individual');
    if (savedSpecialInd) {
        specialKeys.individual.key = savedSpecialInd;
    }
    const savedSpecialBand = localStorage.getItem('rockarena_key_special_band');
    if (savedSpecialBand) {
        specialKeys.band.key = savedSpecialBand;
    }
    updateKeybindingsUI();
}

function updateKeybindingsUI() {
    for (let i = 0; i < 5; i++) {
        const key = laneKeys[i].key.toUpperCase();
        const bindEl = document.getElementById(`bind-${i}`);
        if (bindEl) {
            bindEl.innerText = key;
        }
        const targetEl = laneKeys[i].targetEl;
        if (targetEl) {
            const hintEl = targetEl.querySelector('.key-hint');
            if (hintEl) {
                hintEl.innerText = key;
            }
        }
    }
    const bindSpecialIndEl = document.getElementById('bind-special-ind');
    if (bindSpecialIndEl) {
        bindSpecialIndEl.innerText = getKeyDisplayName(specialKeys.individual.key);
    }
    const bindSpecialBandEl = document.getElementById('bind-special-band');
    if (bindSpecialBandEl) {
        bindSpecialBandEl.innerText = getKeyDisplayName(specialKeys.band.key);
    }
}

// ----------------------------------------------------
// EVENT BINDINGS
// ----------------------------------------------------

// Keybind Buttons click listeners
document.querySelectorAll('.keybind-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Reset all keybind buttons' visual states and text content
        document.querySelectorAll('.keybind-btn').forEach(b => {
            b.classList.remove('waiting');
            const laneAttr = b.getAttribute('data-lane');
            const specialAttr = b.getAttribute('data-special');
            const strongEl = b.querySelector('strong');
            if (strongEl) {
                if (laneAttr !== null) {
                    const laneIndex = parseInt(laneAttr);
                    strongEl.innerText = getKeyDisplayName(laneKeys[laneIndex].key);
                } else if (specialAttr !== null) {
                    strongEl.innerText = getKeyDisplayName(specialKeys[specialAttr].key);
                }
            }
        });
        
        const laneAttr = btn.getAttribute('data-lane');
        const specialAttr = btn.getAttribute('data-special');
        
        if (laneAttr !== null) {
            state.waitingForKeyForLane = parseInt(laneAttr);
        } else if (specialAttr !== null) {
            state.waitingForKeyForLane = `special_${specialAttr}`;
        }
        
        btn.classList.add('waiting');
        const strongEl = btn.querySelector('strong');
        if (strongEl) {
            strongEl.innerText = '...';
        }
    });
});

// Load keybindings on page startup
loadKeybindings();

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
els.inputGpad.addEventListener('click', () => {
    selectInputMode('gamepad');
    
    // Check for active gamepads to help user debug connection
    const gamepads = navigator.getGamepads();
    const hasActiveGamepad = Array.from(gamepads).some(gp => gp !== null);
    if (!hasActiveGamepad) {
        console.warn("[Xbox/PS5] Nenhum controle detectado no navegador ainda. Certifique-se de conectar o controle e pressionar qualquer botão nele para que o navegador o reconheça.");
        alert("Aviso: Nenhum controle de Xbox/PS5 foi detectado ainda pelo navegador.\n\nPara que o navegador reconheça seu controle, você deve conectá-lo ao PC E pressionar qualquer botão no controle com esta página aberta. Tente fazer isso e selecione 'Controle' novamente!");
    }
});

// Menu Screen navigation
els.btnStartGame.addEventListener('click', () => {
    showScreen('song-screen');
});

// Song Selection screen navigation
els.songCards.forEach(card => {
    card.addEventListener('click', () => {
        els.songCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        state.selectedSong = card.getAttribute('data-song');
        els.btnConfirmSong.removeAttribute('disabled');
    });
});

els.btnConfirmSong.addEventListener('click', () => {
    showScreen('class-screen');
});

els.btnBackToMenuSong.addEventListener('click', () => {
    showScreen('menu-screen');
});

els.btnOpenCalibration.addEventListener('click', () => {
    els.calibrationModal.classList.remove('hidden-screen');
});

els.btnCloseCalibration.addEventListener('click', () => {
    els.calibrationModal.classList.add('hidden-screen');
    // Cancel any waiting keybinding remapping states
    if (state.waitingForKeyForLane !== null) {
        state.waitingForKeyForLane = null;
        updateKeybindingsUI();
    }
});

// Class Selection screen navigation
els.btnBackToMenu.addEventListener('click', () => {
    showScreen('song-screen');
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

// UI Difficulty buttons logic
const diffBtns = document.querySelectorAll('.diff-btn');
diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const diff = btn.getAttribute('data-difficulty');
        window.setDifficulty(diff);
    });
});

window.setDifficulty = function(diff) {
    if (!['easy', 'normal', 'hard', 'expert'].includes(diff)) {
        console.warn(`Dificuldade inválida: ${diff}. Escolha entre 'easy', 'normal', 'hard', 'expert'.`);
        return;
    }
    state.selectedDifficulty = diff;
    
    // Update visual buttons active class
    const buttons = document.querySelectorAll('.diff-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-difficulty') === diff) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    console.log(`Dificuldade alterada para: ${diff}`);
};

window.getDifficulty = function() {
    return state.selectedDifficulty;
};

// Debug and editing tools
window.RAChartTools = {
    printDifficultyStats: function(songId) {
        const song = typeof SONGS_CHARTS !== 'undefined' ? SONGS_CHARTS[songId] : null;
        if (!song || !song.instruments) {
            console.warn(`Música ${songId} não encontrada ou sem instrumentos no banco.`);
            return;
        }
        console.log(`\n${songId} difficulty stats:\n`);
        const instruments = ['lead_guitar', 'rhythm_guitar', 'bass', 'drums'];
        instruments.forEach(inst => {
            const chart = song.instruments[inst];
            if (chart) {
                console.log(`${inst}:`);
                console.log(`  easy: ${chart.easy?.notes?.length || 0}`);
                console.log(`  normal: ${chart.normal?.notes?.length || 0}`);
                console.log(`  hard: ${chart.hard?.notes?.length || 0}`);
                console.log(`  expert: ${chart.expert?.notes?.length || 0}`);
            }
        });
    },
    exportDifficulty: function(songId, instrumentId, difficulty) {
        const song = typeof SONGS_CHARTS !== 'undefined' ? SONGS_CHARTS[songId] : null;
        const inst = song?.instruments?.[instrumentId];
        const diffChart = inst?.[difficulty];
        if (diffChart && Array.isArray(diffChart.notes)) {
            console.log(JSON.stringify(diffChart.notes));
            return diffChart.notes;
        } else {
            console.warn(`Chart não encontrado para ${songId} ${instrumentId} ${difficulty}`);
        }
    },
    shiftDifficulty: function(songId, instrumentId, difficulty, deltaSeconds) {
        const song = typeof SONGS_CHARTS !== 'undefined' ? SONGS_CHARTS[songId] : null;
        const inst = song?.instruments?.[instrumentId];
        const diffChart = inst?.[difficulty];
        if (diffChart && Array.isArray(diffChart.notes)) {
            diffChart.notes.forEach(note => {
                note.time = parseFloat((note.time + deltaSeconds).toFixed(3));
            });
            console.log(`Shifted all notes of ${songId} ${instrumentId} ${difficulty} by ${deltaSeconds}s. First note is now at ${diffChart.notes[0]?.time}s.`);
        } else {
            console.warn(`Chart não encontrado para shift: ${songId} ${instrumentId} ${difficulty}`);
        }
    },
    shiftSong: function(songId, deltaSeconds) {
        const song = typeof SONGS_CHARTS !== 'undefined' ? SONGS_CHARTS[songId] : null;
        if (!song || !song.instruments) {
            console.warn(`Música ${songId} não encontrada ou sem instrumentos no banco.`);
            return;
        }
        for (const instId in song.instruments) {
            const inst = song.instruments[instId];
            const diffs = ['easy', 'normal', 'hard', 'expert'];
            diffs.forEach(difficulty => {
                const diffChart = inst[difficulty];
                if (diffChart && Array.isArray(diffChart.notes)) {
                    diffChart.notes.forEach(note => {
                        note.time = parseFloat((note.time + deltaSeconds).toFixed(3));
                    });
                }
            });
        }
        console.log(`[RAChartTools] Shifted ALL notes of song ${songId} by ${deltaSeconds}s.`);
    },
    exportSong: function(songId) {
        const song = typeof SONGS_CHARTS !== 'undefined' ? SONGS_CHARTS[songId] : null;
        if (song) {
            console.log(JSON.stringify(song, null, 4));
            return song;
        } else {
            console.warn(`Música ${songId} não encontrada.`);
        }
    },
    generateDifficulties: function(songId) {
        console.log(`[RAChartTools] A geração de dificuldades a partir do MIDI requer execução via Node.js no workspace.`);
        console.log(`Por favor, execute o comando: 'node write_playable_charts.js' no seu terminal local.`);
    }
};
