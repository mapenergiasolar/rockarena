const fs = require('fs');
const path = require('path');

function parseMidi(filePath) {
    const buffer = fs.readFileSync(filePath);

    // Check header chunk
    const headerType = buffer.toString('ascii', 0, 4);
    if (headerType !== 'MThd') {
        throw new Error('Not a valid MIDI file (missing MThd)');
    }

    const headerLength = buffer.readUInt32BE(4);
    const format = buffer.readUInt16BE(8);
    const numTracks = buffer.readUInt16BE(10);
    const division = buffer.readUInt16BE(12);

    let offset = 8 + headerLength;

    const tracksNotes = {};
    const tempoChanges = [{ tick: 0, tempo: 625000 }]; // Default 96 BPM

    function readVLQ(buf, off) {
        let value = 0;
        let bytesRead = 0;
        while (true) {
            const byte = buf[off + bytesRead];
            bytesRead++;
            value = (value << 7) | (byte & 0x7F);
            if (!(byte & 0x80)) break;
        }
        return { value, bytesRead };
    }

    function ticksToSeconds(tick) {
        let seconds = 0;
        let currentTick = 0;
        let currentTempo = 625000;

        for (const change of tempoChanges) {
            if (tick <= change.tick) break;
            const deltaTicks = Math.min(tick, change.tick) - currentTick;
            seconds += (deltaTicks / division) * (currentTempo / 1000000);
            currentTick = Math.min(tick, change.tick);
            currentTempo = change.tempo;
        }

        if (tick > currentTick) {
            const deltaTicks = tick - currentTick;
            seconds += (deltaTicks / division) * (currentTempo / 1000000);
        }

        return seconds;
    }

    // Scan tracks to gather tempo events first
    let tempOffset = offset;
    for (let t = 0; t < numTracks; t++) {
        if (tempOffset >= buffer.length) break;
        const trackType = buffer.toString('ascii', tempOffset, tempOffset + 4);
        if (trackType !== 'MTrk') {
            tempOffset += 8;
            continue;
        }
        const trackLength = buffer.readUInt32BE(tempOffset + 4);
        const trackStart = tempOffset + 8;
        const trackEnd = trackStart + trackLength;

        let trackOff = trackStart;
        let trackTick = 0;
        let lastStatus = 0;

        while (trackOff < trackEnd) {
            const dt = readVLQ(buffer, trackOff);
            trackOff += dt.bytesRead;
            trackTick += dt.value;

            let status = buffer[trackOff];
            if (status & 0x80) {
                trackOff++;
                lastStatus = status;
            } else {
                status = lastStatus;
            }

            const eventType = status & 0xF0;
            if (status === 0xFF) {
                const metaType = buffer[trackOff];
                trackOff++;
                const len = readVLQ(buffer, trackOff);
                trackOff += len.bytesRead;

                if (metaType === 0x51) {
                    const tempo = (buffer[trackOff] << 16) | (buffer[trackOff + 1] << 8) | buffer[trackOff + 2];
                    tempoChanges.push({ tick: trackTick, tempo });
                }
                trackOff += len.value;
            } else if (status === 0xF0 || status === 0xF7) {
                const len = readVLQ(buffer, trackOff);
                trackOff += len.bytesRead + len.value;
            } else {
                if (eventType === 0x90 || eventType === 0x80 || eventType === 0xA0 || eventType === 0xB0 || eventType === 0xE0) {
                    trackOff += 2;
                } else if (eventType === 0xC0 || eventType === 0xD0) {
                    trackOff += 1;
                }
            }
        }
        tempOffset = trackEnd;
    }

    tempoChanges.sort((a, b) => a.tick - b.tick);

    // Process tracks
    for (let t = 0; t < numTracks; t++) {
        if (offset >= buffer.length) break;
        const trackType = buffer.toString('ascii', offset, offset + 4);
        if (trackType !== 'MTrk') {
            const chunkLength = buffer.readUInt32BE(offset + 4);
            offset += 8 + chunkLength;
            continue;
        }

        const trackLength = buffer.readUInt32BE(offset + 4);
        const trackStart = offset + 8;
        const trackEnd = trackStart + trackLength;

        let trackOff = trackStart;
        let trackTick = 0;
        let lastStatus = 0;
        let trackName = `Track_${t}`;

        const events = [];
        const activeNotes = {};

        while (trackOff < trackEnd) {
            const dt = readVLQ(buffer, trackOff);
            trackOff += dt.bytesRead;
            trackTick += dt.value;

            let status = buffer[trackOff];
            if (status & 0x80) {
                trackOff++;
                lastStatus = status;
            } else {
                status = lastStatus;
            }

            const eventType = status & 0xF0;
            const channel = status & 0x0F;

            if (status === 0xFF) {
                const metaType = buffer[trackOff];
                trackOff++;
                const len = readVLQ(buffer, trackOff);
                trackOff += len.bytesRead;
                const metaData = buffer.slice(trackOff, trackOff + len.value);
                trackOff += len.value;

                if (metaType === 0x03) {
                    trackName = metaData.toString('utf8').trim() || trackName;
                }
            } else if (status === 0xF0 || status === 0xF7) {
                const len = readVLQ(buffer, trackOff);
                trackOff += len.bytesRead + len.value;
            } else {
                if (eventType === 0x90 || eventType === 0x80) {
                    const pitch = buffer[trackOff];
                    const velocity = buffer[trackOff + 1];
                    trackOff += 2;

                    const isNoteOn = (eventType === 0x90) && (velocity > 0);
                    events.push({ tick: trackTick, isNoteOn, pitch, velocity, channel });
                } else if (eventType === 0xA0 || eventType === 0xB0 || eventType === 0xE0) {
                    trackOff += 2;
                } else if (eventType === 0xC0 || eventType === 0xD0) {
                    trackOff += 1;
                }
            }
        }

        if (events.length > 0) {
            const notesList = [];
            const isDrumTrack = trackName.toLowerCase().includes('drum') || trackName.toLowerCase().includes('perc');
            const isBassTrack = trackName.toLowerCase().includes('bass');

            events.forEach(ev => {
                const noteTime = ticksToSeconds(ev.tick);

                let lane = 0;
                if (isDrumTrack) {
                    const p = ev.pitch;
                    if (p === 35 || p === 36) lane = 0; // Bumbo
                    else if (p === 38 || p === 40) lane = 1; // Caixa
                    else if (p === 42 || p === 44 || p === 46 || p === 51) lane = 3; // Chimbal / Ride
                    else if (p === 49 || p === 52 || p === 55 || p === 57) lane = 4; // Crash / Cymbal
                    else lane = 2; // Toms / Caixa alternativo
                } else if (isBassTrack) {
                    const p = ev.pitch;
                    if (p < 36) lane = 0;
                    else if (p < 43) lane = 1;
                    else lane = 2;
                } else {
                    // Guitar (lead / rhythm)
                    const p = ev.pitch;
                    if (p < 52) lane = 0;
                    else if (p < 59) lane = 1;
                    else if (p < 66) lane = 2;
                    else if (p < 73) lane = 3;
                    else lane = 4;
                }

                if (ev.isNoteOn) {
                    activeNotes[ev.pitch] = {
                        startTime: noteTime,
                        lane: lane,
                        intensity: parseFloat((ev.velocity / 127).toFixed(2))
                    };
                } else {
                    const active = activeNotes[ev.pitch];
                    if (active) {
                        const duration = parseFloat((noteTime - active.startTime).toFixed(3));
                        const isHold = (duration > 0.25) && !isDrumTrack;

                        notesList.push({
                            time: parseFloat(active.startTime.toFixed(3)),
                            lane: active.lane,
                            duration: isHold ? duration : 0,
                            type: isHold ? "hold" : "tap",
                            intensity: active.intensity
                        });
                        delete activeNotes[ev.pitch];
                    }
                }
            });

            Object.keys(activeNotes).forEach(pitch => {
                const active = activeNotes[pitch];
                notesList.push({
                    time: parseFloat(active.startTime.toFixed(3)),
                    lane: active.lane,
                    duration: 0,
                    type: "tap",
                    intensity: active.intensity
                });
            });

            notesList.sort((a, b) => a.time - b.time);
            tracksNotes[trackName] = notesList;
        }

        offset = trackEnd;
    }

    return tracksNotes;
}

const DIFFICULTIES_CFG = {
    easy: {
        snap: 8,
        minGaps: { lead_guitar: 0.180, rhythm_guitar: 0.220, bass: 0.230, drums: 0.145 },
        maxLanesInChord: 1,
        weightThreshold: 10
    },
    normal: {
        snap: 16,
        minGaps: { lead_guitar: 0.110, rhythm_guitar: 0.160, bass: 0.165, drums: 0.110 },
        maxLanesInChord: 2,
        weightThreshold: 6
    },
    hard: {
        snap: 16,
        minGaps: { lead_guitar: 0.075, rhythm_guitar: 0.110, bass: 0.120, drums: 0.080 },
        maxLanesInChord: 2,
        weightThreshold: 2
    },
    expert: {
        snap: 32,
        minGaps: { lead_guitar: 0.050, rhythm_guitar: 0.080, bass: 0.090, drums: 0.055 },
        maxLanesInChord: 3,
        weightThreshold: 0
    }
};

const TARGETS = {
    lead_guitar: {
        easy: [90, 160],
        normal: [170, 280],
        hard: [300, 450],
        expert: [450, 650]
    },
    rhythm_guitar: {
        easy: [150, 230],
        normal: [260, 400],
        hard: [450, 650],
        expert: [700, 950]
    },
    bass: {
        easy: [120, 190],
        normal: [220, 330],
        hard: [350, 500],
        expert: [520, 750]
    },
    drums: {
        easy: [250, 400],
        normal: [450, 650],
        hard: [650, 900],
        expert: [900, 1200]
    }
};

function calculateMusicalWeight(note, beatInterval, offset) {
    const beat = (note.time - offset) / beatInterval;
    
    const isDownbeat = Math.abs(beat % 4) < 0.01 || Math.abs((beat % 4) - 2) < 0.01;
    const isOnBeat = Math.abs(beat % 1) < 0.01;
    const isHalfBeat = Math.abs((beat * 2) % 1) < 0.01;
    const isQuarterBeat = Math.abs((beat * 4) % 1) < 0.01;
    
    let weight = note.intensity * 10;
    
    if (isDownbeat) {
        weight += 15;
    } else if (isOnBeat) {
        weight += 10;
    } else if (isHalfBeat) {
        weight += 5;
    } else if (isQuarterBeat) {
        weight += 2;
    }
    
    if (note.duration > 0.25) {
        weight += 5;
    }
    
    return weight;
}

function runFiltering(quantizedNotes, minGap, threshold, instType, difficulty, maxLanesInChord, offset, beatInterval) {
    let notes = quantizedNotes;
    if (difficulty !== 'expert' && instType !== 'lead_guitar') {
        notes = notes.filter(n => n.weight >= threshold);
    }
    
    if (instType === 'drums') {
        notes = notes.filter(n => {
            if (n.lane !== 3) return true;
            const beat = (n.time - offset) / beatInterval;
            if (difficulty === 'easy') {
                return Math.abs(beat % 1) < 0.01;
            } else if (difficulty === 'normal') {
                return Math.abs((beat * 2) % 1) < 0.01;
            } else if (difficulty === 'hard') {
                return Math.abs((beat * 4) % 1) < 0.01;
            }
            return true;
        });
    }
    
    let chordGrouped = [];
    let currentGroup = [];
    
    notes.forEach(n => {
        if (currentGroup.length === 0) {
            currentGroup.push(n);
        } else {
            const first = currentGroup[0];
            if (Math.abs(n.time - first.time) <= 0.035) {
                currentGroup.push(n);
            } else {
                chordGrouped.push(currentGroup);
                currentGroup = [n];
            }
        }
    });
    if (currentGroup.length > 0) {
        chordGrouped.push(currentGroup);
    }
    
    let simplifiedNotes = [];
    chordGrouped.forEach(group => {
        if (group.length <= 1) {
            simplifiedNotes.push(group[0]);
            return;
        }
        
        group.sort((a, b) => b.weight - a.weight || b.intensity - a.intensity || a.lane - b.lane);
        
        const uniqueLanes = [];
        const seenLanes = new Set();
        group.forEach(n => {
            if (!seenLanes.has(n.lane)) {
                seenLanes.add(n.lane);
                uniqueLanes.push(n);
            }
        });
        
        const finalGroup = uniqueLanes.slice(0, maxLanesInChord);
        const chordTime = finalGroup[0].time;
        finalGroup.forEach(n => {
            n.time = chordTime;
            simplifiedNotes.push(n);
        });
    });
    
    simplifiedNotes.sort((a, b) => a.time - b.time || a.lane - b.lane);
    
    let finalNotes = [];
    let lastTimePerLane = {};
    let lastTimeOverall = 0;
    
    if (instType === 'drums') {
        simplifiedNotes.forEach(n => {
            const lastLaneTime = lastTimePerLane[n.lane] || 0;
            const sameLaneCheck = (n.time - lastLaneTime >= 0.120);
            const diffLaneCheck = (n.time - lastTimeOverall >= minGap);
            
            if (lastLaneTime === 0 || (sameLaneCheck && diffLaneCheck)) {
                finalNotes.push(n);
                lastTimePerLane[n.lane] = n.time;
                lastTimeOverall = n.time;
            }
        });
    } else {
        simplifiedNotes.forEach(n => {
            const lastLaneTime = lastTimePerLane[n.lane] || 0;
            if (lastLaneTime === 0 || (n.time - lastLaneTime >= minGap)) {
                finalNotes.push(n);
                lastTimePerLane[n.lane] = n.time;
            }
        });
    }
    
    return finalNotes;
}

function processPlayableForDifficulty(rawNotes, instType, difficulty, offset) {
    const bpm = 96;
    const beatInterval = 60 / bpm;
    const cfg = DIFFICULTIES_CFG[difficulty];
    
    let snap = cfg.snap;
    if (difficulty === 'normal' && (instType === 'bass' || instType === 'rhythm_guitar')) {
        snap = 8;
    }
    if (difficulty === 'expert' && (instType === 'bass' || instType === 'rhythm_guitar')) {
        snap = 16;
    }
    const grid = beatInterval / (snap / 4);
    const minGap = cfg.minGaps[instType];
    const maxLanesInChord = cfg.maxLanesInChord;
    
    // Step 1: Quantization and Offset Addition
    let quantizedNotes = rawNotes.map(n => {
        const timeWithOffset = n.time + offset;
        const quantized = offset + Math.round((timeWithOffset - offset) / grid) * grid;
        
        let type = n.type;
        let duration = n.duration;
        
        if (instType === 'drums') {
            type = 'tap';
            duration = 0;
        }
        
        return {
            time: parseFloat(quantized.toFixed(3)),
            lane: n.lane,
            duration: duration,
            type: type,
            intensity: n.intensity
        };
    });
    
    const seenTimeLane = new Set();
    quantizedNotes = quantizedNotes.filter(n => {
        const key = n.time.toFixed(3) + '-' + n.lane;
        if (seenTimeLane.has(key)) return false;
        seenTimeLane.add(key);
        return true;
    });
    
    quantizedNotes.sort((a, b) => a.time - b.time);
    
    // Step 2: Calculate weights
    quantizedNotes.forEach(n => {
        n.weight = parseFloat(calculateMusicalWeight(n, beatInterval, offset).toFixed(3));
    });
    
    // Step 3: Run target-seeking loop
    let densityGap = minGap;
    let threshold = cfg.weightThreshold;
    let loopCount = 0;
    
    const minTarget = TARGETS[instType][difficulty][0];
    const maxTarget = TARGETS[instType][difficulty][1];
    
    let filtered = runFiltering(quantizedNotes, densityGap, threshold, instType, difficulty, maxLanesInChord, offset, beatInterval);
    
    // Too dense
    while (filtered.length > maxTarget && loopCount < 100) {
        loopCount++;
        densityGap += 0.010;
        if (difficulty !== 'expert') {
            threshold += 0.5;
        }
        filtered = runFiltering(quantizedNotes, densityGap, threshold, instType, difficulty, maxLanesInChord, offset, beatInterval);
    }
    
    // Too sparse
    loopCount = 0;
    while (filtered.length < minTarget && (densityGap > 0.05 || threshold > 0) && loopCount < 100 && rawNotes.length >= minTarget) {
        loopCount++;
        if (densityGap > 0.05) densityGap -= 0.010;
        if (threshold > 0) threshold = Math.max(0, threshold - 0.5);
        filtered = runFiltering(quantizedNotes, densityGap, threshold, instType, difficulty, maxLanesInChord, offset, beatInterval);
    }
    
    // Step 4: Apply Bass cyclical lanes
    if (instType === 'bass') {
        let pattern = [];
        if (difficulty === 'easy') pattern = [0, 1];
        else if (difficulty === 'normal') pattern = [0, 1, 0, 2];
        else if (difficulty === 'hard') pattern = [0, 2, 1, 3, 0];
        else if (difficulty === 'expert') pattern = [0, 2, 1, 3, 4, 0];
        
        filtered.forEach((n, idx) => {
            n.lane = pattern[idx % pattern.length];
        });
    }
    
    filtered.sort((a, b) => a.time - b.time || a.lane - b.lane);
    
    return filtered.map(n => ({
        time: n.time,
        lane: n.lane,
        duration: n.duration,
        type: n.type,
        intensity: n.intensity,
        weight: n.weight
    }));
}

function compileHybridLead(rawLead, rawRhythm, difficulty, offset) {
    const bpm = 96;
    const beatInterval = 60 / bpm;
    
    if (rawLead.length === 0) {
        throw new Error("Lead guitar track is empty! Cannot compile hybrid lead.");
    }
    
    const rawSoloStart = rawLead[0].time - 2.0;
    const rawSoloEnd = rawLead[rawLead.length - 1].time + 2.0;
    const soloStart = rawSoloStart + offset;
    const soloEnd = rawSoloEnd + offset;
    
    // Process lead track independently
    const leadProcessed = processPlayableForDifficulty(rawLead, 'lead_guitar', difficulty, offset);
    const leadInSolo = leadProcessed.filter(n => n.time >= soloStart && n.time <= soloEnd);
    
    // Target counts for Lead Hybrid
    const targetMin = TARGETS.lead_guitar[difficulty][0];
    const targetMax = TARGETS.lead_guitar[difficulty][1];
    
    let densityGap = DIFFICULTIES_CFG[difficulty].minGaps.rhythm_guitar;
    let threshold = DIFFICULTIES_CFG[difficulty].weightThreshold;
    const maxLanesInChord = DIFFICULTIES_CFG[difficulty].maxLanesInChord;
    
    // Quantize rhythm notes
    let snap = DIFFICULTIES_CFG[difficulty].snap;
    if (difficulty === 'normal') snap = 8;
    if (difficulty === 'expert') snap = 16;
    const grid = beatInterval / (snap / 4);
    
    let quantizedRhythm = rawRhythm.map(n => {
        const timeWithOffset = n.time + offset;
        const quantized = offset + Math.round((timeWithOffset - offset) / grid) * grid;
        return {
            time: parseFloat(quantized.toFixed(3)),
            lane: n.lane,
            duration: n.duration,
            type: n.type,
            intensity: n.intensity
        };
    });
    
    const seen = new Set();
    quantizedRhythm = quantizedRhythm.filter(n => {
        const key = n.time.toFixed(3) + '-' + n.lane;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    quantizedRhythm.forEach(n => {
        n.weight = parseFloat(calculateMusicalWeight(n, beatInterval, offset).toFixed(3));
    });
    
    const laneShiftMap = { 0: 1, 1: 2, 2: 0, 3: 4, 4: 3 };
    
    function runMerge(rhythmNotes, gap, thresh) {
        const rhythmProcessed = runFiltering(rhythmNotes, gap, thresh, 'rhythm_guitar', difficulty, maxLanesInChord, offset, beatInterval);
        
        const outNotes = rhythmProcessed
            .filter(n => n.time < soloStart || n.time > soloEnd)
            .map(n => ({
                time: n.time,
                lane: laneShiftMap[n.lane],
                duration: n.duration,
                type: n.type,
                intensity: n.intensity,
                weight: n.weight
            }));
            
        const inNotes = rhythmProcessed
            .filter(rn => {
                if (rn.time < soloStart || rn.time > soloEnd) return false;
                const hasNearbyLead = leadProcessed.some(ln => Math.abs(ln.time - rn.time) < 0.050);
                return !hasNearbyLead;
            })
            .map(n => ({
                time: n.time,
                lane: laneShiftMap[n.lane],
                duration: n.duration,
                type: n.type,
                intensity: n.intensity,
                weight: n.weight
            }));
            
        const combined = [...outNotes, ...leadInSolo, ...inNotes];
        combined.sort((a, b) => a.time - b.time || a.lane - b.lane);
        return { combined, outNotes, inNotes };
    }
    
    let result = runMerge(quantizedRhythm, densityGap, threshold);
    let loopCount = 0;
    
    // Too dense
    while (result.combined.length > targetMax && loopCount < 100) {
        loopCount++;
        densityGap += 0.010;
        threshold += 0.5;
        result = runMerge(quantizedRhythm, densityGap, threshold);
    }
    
    // Too sparse
    loopCount = 0;
    while (result.combined.length < targetMin && (densityGap > 0.05 || threshold > 0) && loopCount < 100) {
        loopCount++;
        if (densityGap > 0.05) densityGap -= 0.010;
        if (threshold > 0) threshold = Math.max(0, threshold - 0.5);
        result = runMerge(quantizedRhythm, densityGap, threshold);
    }
    
    return {
        notes: result.combined,
        soloStart,
        soloEnd,
        rhythmBaseCount: result.outNotes.length + result.inNotes.length,
        leadSoloCount: leadInSolo.length
    };
}

try {
    const midiPath = path.resolve(__dirname, '../data/midi/red-hot-chili-peppers-californication.mid');
    const difficultiesPath = path.resolve(__dirname, '../data/charts/song2_difficulties.js');
    
    const offsets = {
        lead_guitar: 3.062,
        rhythm_guitar: 3.062,
        bass: 3.062,
        drums: 3.062
    };

    console.log(`Parsing MIDI from: ${midiPath}`);
    const rawData = parseMidi(midiPath);

    const rawLead = rawData['lead_guitar'] || [];
    const rawRhythm = rawData['rhythm_guitar'] || rawData['rithym_guitar'] || rawData['Rithym_guitar'] || rawData['Rhythm_guitar'] || [];
    const rawBass = rawData['bass'] || [];
    const rawDrums = rawData['drums'] || [];

    console.log('\n--- RAW MID TRACKS NOTE COUNTS ---');
    console.log(`lead_guitar: ${rawLead.length} notes`);
    console.log(`rhythm_guitar: ${rawRhythm.length} notes`);
    console.log(`bass: ${rawBass.length} notes`);
    console.log(`drums: ${rawDrums.length} notes`);

    const instruments = {
        lead_guitar: {},
        rhythm_guitar: {},
        bass: {},
        drums: {}
    };

    const diffs = ['easy', 'normal', 'hard', 'expert'];
    
    console.log('\n--- PLAYABLE DENSITY PROCESSED NOTE COUNTS ---');
    
    // Compile lead guitar (hybrid)
    console.log(`\nlead_guitar (hybrid):`);
    for (const diff of diffs) {
        const hybrid = compileHybridLead(rawLead, rawRhythm, diff, offsets.lead_guitar);
        instruments.lead_guitar[diff] = {
            notes: hybrid.notes
        };
        console.log(`  ${diff}: ${hybrid.notes.length} notes (${hybrid.rhythmBaseCount} rhythm-base, ${hybrid.leadSoloCount} lead-solo)`);
        console.log(`    soloStart: ${hybrid.soloStart.toFixed(3)}s, soloEnd: ${hybrid.soloEnd.toFixed(3)}s`);
    }

    // Compile other instruments
    for (const inst of ['rhythm_guitar', 'bass', 'drums']) {
        let raw = [];
        if (inst === 'rhythm_guitar') raw = rawRhythm;
        else if (inst === 'bass') raw = rawBass;
        else if (inst === 'drums') raw = rawDrums;

        console.log(`\n${inst}:`);
        for (const diff of diffs) {
            const playable = processPlayableForDifficulty(raw, inst, diff, offsets[inst]);
            instruments[inst][diff] = {
                notes: playable
            };
            console.log(`  ${diff}: ${playable.length} notes`);
        }
    }

    const chartData = {
        songId: "song2",
        bpm: 96,
        offset: offsets.lead_guitar,
        offsets: offsets,
        instruments: instruments
    };

    const difficultiesContent = `/**
 * ROCK ARENA - STANDALONE SONG2 DIFFICULTY CHARTS
 * Autogenerated database containing 4 difficulties (easy, normal, hard, expert).
 * Maps directly over SONGS_CHARTS.song2.
 */

if (typeof SONGS_CHARTS === 'undefined') {
    window.SONGS_CHARTS = {};
}

SONGS_CHARTS.song2 = ${JSON.stringify(chartData, null, 4)};
`;

    fs.writeFileSync(difficultiesPath, difficultiesContent);
    console.log(`\nSuccessfully wrote standalone Californication difficulties to: ${difficultiesPath}`);

} catch (e) {
    console.error('Error compiling song2 difficulties:', e);
}
