const fs = require('fs');
const path = require('path');

function parseMidi(filePath) {
    const buffer = fs.readFileSync(filePath);
    const headerLength = buffer.readUInt32BE(4);
    const numTracks = buffer.readUInt16BE(10);
    const division = buffer.readUInt16BE(12);

    let offset = 8 + headerLength;
    const tracksInfo = [];
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

    // First scan for tempos
    let tempOffset = offset;
    for (let t = 0; t < numTracks; t++) {
        if (tempOffset >= buffer.length) break;
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
            if (status & 0x80) { trackOff++; lastStatus = status; } else { status = lastStatus; }
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
                if ((status & 0xF0) === 0x90 || (status & 0xF0) === 0x80) trackOff += 2;
                else if ((status & 0xF0) === 0xC0 || (status & 0xF0) === 0xD0) trackOff += 1;
                else if ((status & 0xF0) === 0xA0 || (status & 0xF0) === 0xB0 || (status & 0xF0) === 0xE0) trackOff += 2;
            }
        }
        tempOffset = trackEnd;
    }
    tempoChanges.sort((a, b) => a.tick - b.tick);

    // Process tracks
    for (let t = 0; t < numTracks; t++) {
        if (offset >= buffer.length) break;
        const trackLength = buffer.readUInt32BE(offset + 4);
        const trackStart = offset + 8;
        const trackEnd = trackStart + trackLength;

        let trackOff = trackStart;
        let trackTick = 0;
        let lastStatus = 0;
        let trackName = `Track_${t}`;
        let noteCount = 0;
        let firstNoteTime = null;

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
                    if (eventType === 0x90 && velocity > 0) {
                        noteCount++;
                        if (firstNoteTime === null) {
                            firstNoteTime = ticksToSeconds(trackTick);
                        }
                    }
                } else if (eventType === 0xA0 || eventType === 0xB0 || eventType === 0xE0) {
                    trackOff += 2;
                } else if (eventType === 0xC0 || eventType === 0xD0) {
                    trackOff += 1;
                }
            }
        }
        tracksInfo.push({ id: t, name: trackName, notes: noteCount, firstNoteTime });
        offset = trackEnd;
    }
    return { tempoChanges: tempoChanges.map(c => ({ tick: c.tick, bpm: 60000000 / c.tempo })), tracksInfo };
}

try {
    const filePath = path.resolve(__dirname, 'red-hot-chili-peppers-californication.mid');
    console.log(JSON.stringify(parseMidi(filePath), null, 2));
} catch (e) {
    console.error(e);
}
