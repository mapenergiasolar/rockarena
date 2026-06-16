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

// Playable processing logic
function processPlayable(rawNotes, instType, offsetVal) {
    const bpm = 96;
    const beatInterval = 60 / bpm;

    // Choose snaps and minGaps
    let grid = 0;
    let minGap = 0;
    let maxLanesInChord = 2;

    if (instType === 'lead_guitar') {
        grid = beatInterval / 4; // snap 16
        minGap = 0.090;
        maxLanesInChord = 2;
    } else if (instType === 'rhythm_guitar') {
        grid = beatInterval / 4; // snap 16
        minGap = 0.140;
        maxLanesInChord = 2;
    } else if (instType === 'bass') {
        grid = beatInterval / 2; // snap 8
        minGap = 0.180;
        maxLanesInChord = 1;
    } else if (instType === 'drums') {
        grid = beatInterval / 4; // snap 16
        minGap = 0.090; // for different lanes (same lane has 0.120)
        maxLanesInChord = 3;
    }

    // Step 1: Quantization and Offset Addition
    let notes = rawNotes.map(n => {
        const timeWithOffset = n.time + offsetVal;
        const quantized = offsetVal + Math.round((timeWithOffset - offsetVal) / grid) * grid;
        return {
            time: parseFloat(quantized.toFixed(3)),
            lane: n.lane,
            duration: n.duration,
            type: n.type,
            intensity: n.intensity
        };
    });

    // Remove any notes that have duplicate time and lane
    const seenTimeLane = new Set();
    notes = notes.filter(n => {
        const key = n.time.toFixed(3) + '-' + n.lane;
        if (seenTimeLane.has(key)) return false;
        seenTimeLane.add(key);
        return true;
    });

    notes.sort((a, b) => a.time - b.time);

    // Step 2: Chord Simplification (notes within 0.035s)
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

        // Sort by intensity desc, then lane asc
        group.sort((a, b) => b.intensity - a.intensity || a.lane - b.lane);

        // Unique lanes
        const uniqueLanes = [];
        const seenLanes = new Set();
        group.forEach(n => {
            if (!seenLanes.has(n.lane)) {
                seenLanes.add(n.lane);
                uniqueLanes.push(n);
            }
        });

        // Slice to max chord size
        const finalGroup = uniqueLanes.slice(0, maxLanesInChord);

        // Make their times exactly identical (use the first note's time as chord time)
        const chordTime = finalGroup[0].time;
        finalGroup.forEach(n => {
            n.time = chordTime;
            simplifiedNotes.push(n);
        });
    });

    simplifiedNotes.sort((a, b) => a.time - b.time || a.lane - b.lane);

    // Step 3: minGap Filtering
    let finalNotes = [];
    let lastTimePerLane = {};
    let lastTimeOverall = 0;

    simplifiedNotes.forEach(n => {
        const lastLaneTime = lastTimePerLane[n.lane] || 0;

        if (instType === 'drums') {
            const sameLaneCheck = (n.time - lastLaneTime >= 0.120);
            const diffLaneCheck = (n.time - lastTimeOverall >= 0.090);

            if (lastLaneTime === 0 || (sameLaneCheck && diffLaneCheck)) {
                finalNotes.push(n);
                lastTimePerLane[n.lane] = n.time;
                lastTimeOverall = n.time;
            }
        } else {
            if (lastLaneTime === 0 || (n.time - lastLaneTime >= minGap)) {
                finalNotes.push(n);
                lastTimePerLane[n.lane] = n.time;
            }
        }
    });

    // Step 4: Dynamic Density Control via minGap adjustment
    let loopCount = 0;
    let densityGap = minGap;
    let minTarget = 250, maxTarget = 400;
    if (instType === 'rhythm_guitar') { minTarget = 250; maxTarget = 450; }
    else if (instType === 'bass') { minTarget = 180; maxTarget = 300; }
    else if (instType === 'drums') { minTarget = 400; maxTarget = 700; }

    while (finalNotes.length > maxTarget && loopCount < 50) {
        loopCount++;
        densityGap += 0.010;

        let tempNotes = [];
        let tempLastTime = {};
        let tempLastOverall = 0;

        finalNotes.forEach(n => {
            const lastT = tempLastTime[n.lane] || 0;
            if (instType === 'drums') {
                const sameLaneCheck = (n.time - lastT >= densityGap + 0.030);
                const diffLaneCheck = (n.time - tempLastOverall >= densityGap);
                if (lastT === 0 || (sameLaneCheck && diffLaneCheck)) {
                    tempNotes.push(n);
                    tempLastTime[n.lane] = n.time;
                    tempLastOverall = n.time;
                }
            } else {
                if (lastT === 0 || (n.time - lastT >= densityGap)) {
                    tempNotes.push(n);
                    tempLastTime[n.lane] = n.time;
                }
            }
        });
        finalNotes = tempNotes;
    }

    return finalNotes;
}

try {
    const cleanMidiPath = path.resolve(__dirname, 'hellraiser_clean.mid');
    const chartsPath = path.resolve(__dirname, 'charts.js');
    const midiChartPath = path.resolve(__dirname, 'song3_hellraiser_chart_from_midi.js');

    // ADJUST THE OFFSET VALUES HERE PER INSTRUMENT (in seconds):
    const offsets = {
        lead_guitar: 10.78,
        rhythm_guitar: 10.85,
        bass: 10.8,
        drums: 10.81
    };

    console.log(`Parsing Clean MIDI from: ${cleanMidiPath}`);
    const rawData = parseMidi(cleanMidiPath);

    const rawLead = rawData['lead_guitar'] || [];
    const rawRhythm = rawData['rhythm_guitar'] || [];
    const rawBass = rawData['bass'] || [];
    const rawDrums = rawData['drums'] || [];

    console.log('\n--- RAW MID TRACKS NOTE COUNTS ---');
    console.log(`lead_guitar: ${rawLead.length} notes`);
    console.log(`rhythm_guitar: ${rawRhythm.length} notes`);
    console.log(`bass: ${rawBass.length} notes`);
    console.log(`drums: ${rawDrums.length} notes`);

    const playableLead = processPlayable(rawLead, 'lead_guitar', offsets.lead_guitar);
    const playableRhythm = processPlayable(rawRhythm, 'rhythm_guitar', offsets.rhythm_guitar);
    const playableBass = processPlayable(rawBass, 'bass', offsets.bass);
    const playableDrums = processPlayable(rawDrums, 'drums', offsets.drums);

    console.log('\n--- PLAYABLE DENSITY PROCESSED NOTE COUNTS ---');
    console.log(`lead_guitar: ${playableLead.length} notes`);
    console.log(`rhythm_guitar: ${playableRhythm.length} notes`);
    console.log(`bass: ${playableBass.length} notes`);
    console.log(`drums: ${playableDrums.length} notes`);

    function mapRawWithOffset(notes, offsetVal) {
        return notes.map(n => ({
            time: parseFloat((n.time + offsetVal).toFixed(3)),
            lane: n.lane,
            duration: n.duration,
            type: n.type,
            intensity: n.intensity
        }));
    }

    const rawLeadOffset = mapRawWithOffset(rawLead, offsets.lead_guitar);
    const rawRhythmOffset = mapRawWithOffset(rawRhythm, offsets.rhythm_guitar);
    const rawBassOffset = mapRawWithOffset(rawBass, offsets.bass);
    const rawDrumsOffset = mapRawWithOffset(rawDrums, offsets.drums);

    const chartData = {
        songId: "song3",
        bpm: 96,
        offset: offsets.lead_guitar,
        offsets: offsets,
        instruments: {
            lead_guitar: {
                difficulty: "prototype",
                raw: { notes: rawLeadOffset },
                playable: { notes: playableLead },
                notes: playableLead
            },
            rhythm_guitar: {
                difficulty: "prototype",
                raw: { notes: rawRhythmOffset },
                playable: { notes: playableRhythm },
                notes: playableRhythm
            },
            bass: {
                difficulty: "prototype",
                raw: { notes: rawBassOffset },
                playable: { notes: playableBass },
                notes: playableBass
            },
            drums: {
                difficulty: "prototype",
                raw: { notes: rawDrumsOffset },
                playable: { notes: playableDrums },
                notes: playableDrums
            }
        }
    };

    const chartsContent = `/**
 * ROCK ARENA - SONGS AND INSTRUMENTS CHARTS DATABASE
 * Contains structured note charts for all tracks.
 * Automatically generated from MIDI.
 */

const SONGS_CHARTS = {
    song3: ${JSON.stringify(chartData)}
};
`;

    const midiChartContent = `/**
 * ROCK ARENA - HELLRAISER MIDI CHART
 * Standalone chart for Ozzy Osbourne - Hellraiser.
 */

if (typeof SONGS_CHARTS === 'undefined') {
    window.SONGS_CHARTS = {};
}

SONGS_CHARTS.song3 = ${JSON.stringify(chartData)};
`;

    fs.writeFileSync(chartsPath, chartsContent);
    console.log(`\nSuccessfully wrote full charts database to: ${chartsPath}`);

    fs.writeFileSync(midiChartPath, midiChartContent);
    console.log(`Successfully wrote standalone MIDI chart to: ${midiChartPath}`);

} catch (e) {
    console.error('Error compiling charts.js:', e);
}
