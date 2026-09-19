const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const ROOT = __dirname;
const QFILE = path.join(ROOT, 'fragen.json');
const MEDIA = path.join(ROOT, 'public', 'media');
fs.mkdirSync(MEDIA, { recursive: true });

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.get('/healthz', (req, res) => res.json({ ok: true }));

const readQ = () => JSON.parse(fs.readFileSync(QFILE, 'utf8'));
const writeQ = q => fs.writeFileSync(QFILE, JSON.stringify(q, null, 2), 'utf8');
const cleanName = n => String(n || '').trim().replace(/\s+/g, ' ').slice(0, 24) || 'Gast';
const makeCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  do { out = Array.from({ length: 5 }, () => chars[crypto.randomInt(chars.length)]).join(''); }
  while (games.has(out));
  return out;
};
const token = () => crypto.randomBytes(24).toString('hex');

app.get('/api/questions', (req, res) => res.json(readQ()));

const games = new Map();
function newGame() {
  const code = makeCode();
  const game = {
    code,
    hostToken: token(),
    players: [],
    state: {
      mode: 'board', question: null, special: null,
      buzzerOpen: false, buzzedBy: null, firstBuzzedBy: null, lockedPlayers: []
    }
  };
  games.set(code, game);
  return game;
}
function gameState(game) {
  return { code: game.code, players: game.players.map(({ id, name, score, connected }) => ({ id, name, score, connected })), ...game.state };
}
function emit(game) { io.to(`game:${game.code}`).emit('state', gameState(game)); }
function resetBuzz(game, clearFirst = true) { game.state.buzzerOpen = false; game.state.buzzedBy = null; game.state.lockedPlayers = []; if (clearFirst) game.state.firstBuzzedBy = null; }
function hostAuthorized(req) {
  const code = String(req.headers['x-game-code'] || '').toUpperCase();
  const hostToken = String(req.headers['x-host-token'] || '');
  const game = games.get(code);
  return game && hostToken && game.hostToken === hostToken ? game : null;
}

app.post('/api/game', (req, res) => {
  const game = newGame();
  res.json({ ok: true, code: game.code, hostToken: game.hostToken });
});
app.get('/api/game/:code', (req, res) => {
  const game = games.get(String(req.params.code || '').toUpperCase());
  if (!game) return res.status(404).json({ ok: false, error: 'Spiel nicht gefunden' });
  res.json({ ok: true, code: game.code, players: game.players.map(p => ({ name: p.name, score: p.score, connected: p.connected })) });
});

app.put('/api/questions', (req, res) => {
  try {
    const game = hostAuthorized(req);
    if (!game) return res.status(403).json({ ok: false, error: 'Host-Berechtigung fehlt' });
    writeQ(req.body);
    io.to(`game:${game.code}`).emit('questionsUpdated', readQ());
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.post('/api/question-used', (req, res) => {
  try {
    const game = hostAuthorized(req);
    if (!game) return res.status(403).json({ ok: false, error: 'Host-Berechtigung fehlt' });
    const { category, index, used } = req.body || {};
    const q = readQ(); const i = Number(index);
    if (!Array.isArray(q[category]) || !q[category][i]) throw new Error('Frage nicht gefunden');
    q[category][i].used = Boolean(used); writeQ(q);
    io.to(`game:${game.code}`).emit('questionsUpdated', q); res.json({ ok: true });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.post('/api/reset-used', (req, res) => {
  try {
    const game = hostAuthorized(req);
    if (!game) return res.status(403).json({ ok: false, error: 'Host-Berechtigung fehlt' });
    const q = readQ();
    for (const c of ['YouTube-Titel', 'Back to School', 'Was bin ich?', 'Filme & Serien', 'Musik', 'Flaggen']) if (Array.isArray(q[c])) q[c].forEach(x => x.used = false);
    writeQ(q); io.to(`game:${game.code}`).emit('questionsUpdated', q); res.json({ ok: true });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.post('/api/special-image', (req, res) => {
  try {
    const game = hostAuthorized(req);
    if (!game) return res.status(403).json({ ok: false, error: 'Host-Berechtigung fehlt' });
    const { section, index, field, data, filename, person1, person2 } = req.body || {};
    if (!['Face Morph', 'Wo zum Henker ist das?'].includes(section)) throw new Error('Ungültige Sonderrunde');
    const allowed = section === 'Face Morph' ? ['bild', 'original1', 'original2'] : ['bild'];
    if (!allowed.includes(field)) throw new Error('Ungültiges Bildfeld');
    const i = Number(index); const q = readQ();
    if (!q.Sonderrunden?.[section]?.[i]) throw new Error('Eintrag nicht gefunden');
    const m = String(data || '').match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
    if (!m) throw new Error('Bitte PNG, JPG, JPEG, WEBP oder GIF verwenden');
    const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    const name = `special_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
    fs.writeFileSync(path.join(MEDIA, name), Buffer.from(m[2], 'base64'));
    if (section === 'Face Morph') {
      // Preserve unsaved editor text when an image is uploaded.
      // The image endpoint reads the current server state, so carry over
      // Person 1/Person 2 from the editor request before writing the image.
      if (person1 !== undefined) q.Sonderrunden[section][i].person1 = String(person1);
      if (person2 !== undefined) q.Sonderrunden[section][i].person2 = String(person2);
    }
    q.Sonderrunden[section][i][field] = '/media/' + name;
    if (section === 'Face Morph') q.Sonderrunden[section][i][field + 'Name'] = String(filename || '');
    writeQ(q);
    io.to(`game:${game.code}`).emit('questionsUpdated', q);
    res.json({ ok: true, url: '/media/' + name, item: q.Sonderrunden[section][i] });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

io.on('connection', socket => {
  socket.on('createGame', () => {
    // Eine Host-Seite darf jederzeit eine komplett neue Lobby erzeugen.
    // Zuerst die bisherige Lobby verlassen, damit der Host nicht mehr
    // gleichzeitig als Host in der alten Lobby aktiv bleibt.
    if (socket.data.code) socket.leave(`game:${socket.data.code}`);
    const game = newGame();
    socket.data.code = game.code;
    socket.data.host = true;
    socket.data.viewer = false;
    socket.data.playerId = null;
    socket.data.playerName = null;
    socket.join(`game:${game.code}`);
    socket.emit('gameCreated', { code: game.code, hostToken: game.hostToken });
    emit(game);
  });
  socket.on('watchGame', ({ code }) => {
    const game = games.get(String(code || '').toUpperCase());
    if (!game) return socket.emit('errorMessage', 'Spielcode nicht gefunden.');
    socket.join(`game:${game.code}`); socket.data.code = game.code; socket.data.viewer = true; socket.emit('watching', { code: game.code }); emit(game);
  });
  socket.on('hostJoin', ({ code, hostToken }) => {
    const game = games.get(String(code || '').toUpperCase());
    if (!game || game.hostToken !== hostToken) return socket.emit('errorMessage', 'Host-Sitzung nicht gefunden. Bitte neues Spiel erstellen.');
    socket.join(`game:${game.code}`); socket.data.code = game.code; socket.data.host = true; emit(game);
  });
  socket.on('joinGame', ({ code, name }) => {
    const game = games.get(String(code || '').toUpperCase());
    if (!game) return socket.emit('joinError', 'Spielcode nicht gefunden.');
    const n = cleanName(name);
    let player = game.players.find(p => p.name.toLowerCase() === n.toLowerCase());
    if (!player) {
      if (game.players.length >= 12) return socket.emit('joinError', 'Maximal 12 Spieler sind möglich.');
      player = { id: crypto.randomUUID(), name: n, score: 0, connected: true };
      game.players.push(player);
    } else player.connected = true;
    socket.join(`game:${game.code}`); socket.data.code = game.code; socket.data.playerId = player.id; socket.data.playerName = player.name;
    socket.emit('joined', { code: game.code, name: player.name }); emit(game);
  });
  socket.on('requestState', () => { const game = games.get(socket.data.code); if (game) socket.emit('state', gameState(game)); });

  socket.on('showBoard', () => { const game = games.get(socket.data.code); if (!game || !socket.data.host) return; game.state.mode='board'; game.state.question=null; game.state.special=null; resetBuzz(game); emit(game); });
  socket.on('showQuestion', q => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; game.state.mode='question'; game.state.question={...q,revealed:false}; game.state.special=null; resetBuzz(game); emit(game); });
  socket.on('revealQuestion', () => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; if(game.state.mode==='question'&&game.state.question){game.state.question.revealed=true;emit(game);} });
  socket.on('showSpecial', x => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; game.state.mode='special'; game.state.special={...x,revealed:false}; game.state.question=null; resetBuzz(game); emit(game); });
  socket.on('revealSpecial', payload => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; if(game.state.mode==='special'&&game.state.special){if(payload&&typeof payload==='object')game.state.special={...game.state.special,...payload};game.state.special.revealed=true;emit(game);} });
  socket.on('openBuzzer', () => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; game.state.buzzerOpen=true;game.state.buzzedBy=null;emit(game); });
  socket.on('closeBuzzer', () => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; game.state.buzzerOpen=false;emit(game); });
  socket.on('buzz', () => { const game=games.get(socket.data.code); if(!game||!socket.data.playerId)return; const p=game.players.find(x=>x.id===socket.data.playerId); if(!p||!p.connected||!game.state.buzzerOpen||game.state.buzzedBy||game.state.lockedPlayers.includes(p.id))return; game.state.buzzedBy=p.name; if(!game.state.firstBuzzedBy) game.state.firstBuzzedBy=p.name; game.state.buzzerOpen=false; emit(game); io.to(`game:${game.code}`).emit('buzzAccepted', { player: p.name }); });
  socket.on('wrong', ({ player, points }) => {
    const game=games.get(socket.data.code);
    if(!game||!socket.data.host)return;
    const p=game.players.find(x=>x.name===player);
    if(!p)return;
    const n=Number(points)||0;
    p.score-=n;

    // The player who had the first buzzer is locked out for the rest of this question.
    if(!game.state.lockedPlayers.includes(p.id)) game.state.lockedPlayers.push(p.id);

    // Hide the current buzzer indication and reopen the buzzer for everyone else.
    // firstBuzzedBy stays untouched so the original first buzzer remains excluded.
    game.state.buzzedBy=null;
    game.state.buzzerOpen=true;
    emit(game);
  });
  socket.on('correct', ({ player, points }) => {
    const game=games.get(socket.data.code);
    if(!game||!socket.data.host)return;
    const p=game.players.find(x=>x.name===player);
    if(!p)return;
    p.score+=Number(points)||0;

    // End the buzzer for this question and hide the indication.
    // The first-buzzer marker is no longer needed because the question is over.
    resetBuzz(game, true);
    emit(game);
  });
  socket.on('addPoints', ({ player, amount }) => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; const p=game.players.find(x=>x.name===player); if(!p)return;p.score+=Number(amount)||0;emit(game); });
  socket.on('setScore', ({ player, value }) => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; const p=game.players.find(x=>x.name===player); if(!p)return;p.score=Number(value)||0;emit(game); });
  socket.on('resetScores', () => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; game.players.forEach(p=>p.score=0);emit(game); });

  socket.on('disconnect', () => {
    const game=games.get(socket.data.code); if(!game||!socket.data.playerId)return;
    const p=game.players.find(x=>x.id===socket.data.playerId); if(p)p.connected=false; emit(game);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`FRAGENHAGEL läuft auf Port ${PORT}`));
