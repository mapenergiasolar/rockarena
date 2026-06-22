const fs = require('fs');
const content = fs.readFileSync('c:/Users/rgr_r/OneDrive/Área de Trabalho/rock arena/game.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
    if (line.includes('countdown') || line.includes('gameAudio.play') || line.includes('startMusic') || line.includes('startGame')) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
    }
});
