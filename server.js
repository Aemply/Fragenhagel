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

// Spotify Premium Web Playback authentication (Host only)
const spotifySessions = new Map();
const spotifyOAuthStates = new Map();
const SPOTIFY_SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';
function spotifyCookie(req){
  const raw=String(req.headers.cookie||'');
  const m=raw.match(/(?:^|;\s*)fh_spotify_sid=([^;]+)/);
  return m?decodeURIComponent(m[1]):'';
}
function setSpotifyCookie(res,sid){
  const secure=process.env.NODE_ENV==='production' || process.env.RENDER==='true';
  res.setHeader('Set-Cookie',`fh_spotify_sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax${secure?'; Secure':''}; Max-Age=2592000`);
}
function spotifyRedirectUri(req){
  if(process.env.SPOTIFY_REDIRECT_URI) return String(process.env.SPOTIFY_REDIRECT_URI);
  const proto=String(req.headers['x-forwarded-proto']||req.protocol||'http').split(',')[0];
  const host=String(req.headers['x-forwarded-host']||req.get('host')||'localhost:3000').split(',')[0];
  return `${proto}://${host}/api/spotify/callback`;
}
function spotifyConfigured(){return !!(process.env.SPOTIFY_CLIENT_ID&&process.env.SPOTIFY_CLIENT_SECRET);}
async function spotifyTokenRequest(params){
  const auth=Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Authorization':`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error_description||j.error||`Spotify Token-Fehler ${r.status}`);
  return j;
}
async function spotifyRefreshSession(session){
  if(!session?.refresh_token) throw new Error('Spotify-Anmeldung abgelaufen');
  const j=await spotifyTokenRequest({grant_type:'refresh_token',refresh_token:session.refresh_token});
  session.access_token=j.access_token;
  session.expires_at=Date.now()+Math.max(60,Number(j.expires_in)||3600)*1000;
  if(j.refresh_token) session.refresh_token=j.refresh_token;
  return session;
}
async function spotifyAccess(req){
  const sid=spotifyCookie(req); const session=sid&&spotifySessions.get(sid);
  if(!session) throw new Error('Spotify-Anmeldung fehlt');
  if(Date.now()>session.expires_at-60000) await spotifyRefreshSession(session);
  if(session.product!=='premium') throw new Error('Spotify Premium wird für die vollständige Wiedergabe benötigt.');
  return session;
}
async function spotifyApi(session,path,options={}){
  if(Date.now()>session.expires_at-60000) await spotifyRefreshSession(session);
  let r=await fetch(`https://api.spotify.com/v1${path}`,{...options,headers:{...(options.headers||{}),'Authorization':`Bearer ${session.access_token}`,'Content-Type':'application/json'}});
  if(r.status===401){await spotifyRefreshSession(session);r=await fetch(`https://api.spotify.com/v1${path}`,{...options,headers:{...(options.headers||{}),'Authorization':`Bearer ${session.access_token}`,'Content-Type':'application/json'}});}
  const text=await r.text(); let body={}; try{body=text?JSON.parse(text):{};}catch{}
  if(!r.ok) throw new Error(body?.error?.message||`Spotify API Fehler ${r.status}`);
  return body;
}

app.get('/api/spotify/config',(req,res)=>res.json({configured:spotifyConfigured(),redirectUri:spotifyRedirectUri(req)}));
app.get('/api/spotify/status',async(req,res)=>{
  try{
    const sid=spotifyCookie(req); const session=sid&&spotifySessions.get(sid);
    if(!session) return res.json({authenticated:false,configured:spotifyConfigured(),redirectUri:spotifyRedirectUri(req)});
    if(Date.now()>session.expires_at-60000) await spotifyRefreshSession(session);
    res.json({authenticated:true,configured:spotifyConfigured(),product:session.product,displayName:session.display_name||'',premium:session.product==='premium',redirectUri:spotifyRedirectUri(req)});
  }catch(e){res.json({authenticated:false,configured:spotifyConfigured(),error:e.message,redirectUri:spotifyRedirectUri(req)});}
});
app.get('/api/spotify/login',(req,res)=>{
  if(!spotifyConfigured()) return res.status(500).send('<h2>Spotify ist noch nicht eingerichtet.</h2><p>Bitte <b>SPOTIFY_CLIENT_ID</b>, <b>SPOTIFY_CLIENT_SECRET</b> und die Redirect-URL in Render hinterlegen.</p><p>Redirect-URL: <code>'+spotifyRedirectUri(req)+'</code></p>');
  const state=crypto.randomBytes(24).toString('hex');
  let returnTo=String(req.query.return||'').trim();
  if(!returnTo.startsWith('/host.html')) returnTo='/host.html';
  spotifyOAuthStates.set(state,{created:Date.now(),returnTo});
  for(const [k,v] of spotifyOAuthStates) if(Date.now()-v.created>10*60*1000) spotifyOAuthStates.delete(k);
  const u=new URL('https://accounts.spotify.com/authorize');
  u.searchParams.set('client_id',process.env.SPOTIFY_CLIENT_ID);u.searchParams.set('response_type','code');u.searchParams.set('redirect_uri',spotifyRedirectUri(req));u.searchParams.set('scope',SPOTIFY_SCOPES);u.searchParams.set('state',state);
  res.redirect(u.toString());
});
app.get('/api/spotify/callback',async(req,res)=>{
  const state=String(req.query.state||''); const saved=spotifyOAuthStates.get(state); spotifyOAuthStates.delete(state);
  if(!saved||Date.now()-saved.created>10*60*1000) return res.status(400).send('<h2>Spotify-Anmeldung abgelaufen.</h2><p>Bitte zurück zum Host und erneut anmelden.</p>');
  if(req.query.error) return res.status(400).send('<h2>Spotify-Anmeldung abgebrochen.</h2><p>'+String(req.query.error_description||req.query.error)+'</p><p><a href="/host.html">Zurück zum Host</a></p>');
  try{
    const t=await spotifyTokenRequest({grant_type:'authorization_code',code:String(req.query.code||''),redirect_uri:spotifyRedirectUri(req)});
    const grantedScopes=String(t.scope||'').split(/\s+/).filter(Boolean);if(!grantedScopes.includes('streaming'))throw new Error('Spotify hat die Berechtigung „streaming“ nicht erteilt. Bitte erneut anmelden und den Zugriff bestätigen.');const profile=await fetch('https://api.spotify.com/v1/me',{headers:{Authorization:`Bearer ${t.access_token}`}}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j?.error?.message||'Spotify-Profil konnte nicht geladen werden');return j;});
    const sid=crypto.randomBytes(24).toString('hex'); spotifySessions.set(sid,{access_token:t.access_token,refresh_token:t.refresh_token,expires_at:Date.now()+Math.max(60,Number(t.expires_in)||3600)*1000,product:profile.product,display_name:profile.display_name||''});
    setSpotifyCookie(res,sid);
    const returnTo=saved.returnTo||'/host.html';
    const u=new URL(returnTo,'http://localhost');
    u.searchParams.set('spotify','connected');
    res.redirect(u.pathname+(u.search?u.search:''));
  }catch(e){res.status(500).send('<h2>Spotify-Anmeldung fehlgeschlagen.</h2><p>'+String(e.message)+'</p><p><a href="/host.html">Zurück zum Host</a></p>');}
});
app.post('/api/spotify/logout',(req,res)=>{const sid=spotifyCookie(req);if(sid)spotifySessions.delete(sid);res.setHeader('Set-Cookie','fh_spotify_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');res.json({ok:true});});
app.get('/api/spotify/token',async(req,res)=>{try{const s=await spotifyAccess(req);res.json({access_token:s.access_token});}catch(e){res.status(401).json({error:e.message});}});
let spotifyCatalogToken={access_token:'',expires_at:0};
async function spotifyCatalogAccess(){
  if(!spotifyConfigured()) throw new Error('Spotify ist noch nicht eingerichtet.');
  if(spotifyCatalogToken.access_token && Date.now()<spotifyCatalogToken.expires_at-60000) return spotifyCatalogToken.access_token;
  const j=await spotifyTokenRequest({grant_type:'client_credentials'});
  spotifyCatalogToken={access_token:j.access_token,expires_at:Date.now()+Math.max(60,Number(j.expires_in)||3600)*1000};
  return spotifyCatalogToken.access_token;
}
async function spotifyCatalogApi(path){
  let token=await spotifyCatalogAccess();
  let r=await fetch(`https://api.spotify.com/v1${path}`,{headers:{Authorization:`Bearer ${token}`}});
  if(r.status===401){
    spotifyCatalogToken={access_token:'',expires_at:0};
    token=await spotifyCatalogAccess();
    r=await fetch(`https://api.spotify.com/v1${path}`,{headers:{Authorization:`Bearer ${token}`}});
  }
  const text=await r.text(); let body={}; try{body=text?JSON.parse(text):{};}catch{}
  if(!r.ok) throw new Error(body?.error?.message||`Spotify API Fehler ${r.status}`);
  return body;
}
app.get('/api/spotify/track-metadata',async(req,res)=>{
  try{
    const raw=String(req.query.url||'').trim();
    const m=raw.match(/open\.spotify\.com\/(?:intl-([^/]+)\/)?track\/([A-Za-z0-9]+)/i);
    const uri=/^spotify:track:[A-Za-z0-9]+$/.test(raw)?raw:(m?`spotify:track:${m[2]}`:'');
    const id=uri.replace('spotify:track:','');
    if(!id)return res.status(400).json({error:'Kein gültiger Spotify-Track-Link.'});
    const market=(m?.[1]||'DE').slice(0,2).toUpperCase();
    const track=await spotifyCatalogApi(`/tracks/${encodeURIComponent(id)}?market=${encodeURIComponent(market)}`);
    const artists=(track.artists||[]).map(a=>a.name).filter(Boolean).join(', ');
    res.json({name:track.name||'',artists,answer:[track.name,artists].filter(Boolean).join(' - '),id});
  }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/spotify/play',async(req,res)=>{
  try{
    const s=await spotifyAccess(req);
    const {uri,device_id,position_ms}=req.body||{};
    const did=String(device_id||'').trim();
    if(!String(uri||'').startsWith('spotify:track:'))return res.status(400).json({error:'Nur Spotify-Track-Links werden unterstützt.'});
    if(!did)return res.status(400).json({error:'Spotify-Player ist noch nicht bereit. Bitte kurz warten und erneut auf Play drücken.'});

    // Der Web Playback SDK stellt zunächst ein Spotify-Connect-Gerät bereit.
    // Dieses Gerät muss vor dem /play-Aufruf aktiv übertragen werden.
    await spotifyApi(s,'/me/player',{method:'PUT',body:JSON.stringify({device_ids:[did],play:false})});

    // Spotify propagiert den Device-Transfer nicht immer sofort. Deshalb warten
    // wir kurz und prüfen, bis das Browser-Gerät tatsächlich aktiv ist.
    let active=false;
    for(let i=0;i<10;i++){
      await new Promise(r=>setTimeout(r,250));
      try{
        const d=await spotifyApi(s,'/me/player/devices',{method:'GET'});
        const dev=(d.devices||[]).find(x=>x.id===did);
        if(dev && dev.is_active){active=true;break;}
      }catch{}
    }
    if(!active)return res.status(409).json({error:'Spotify-Player wurde noch nicht als aktives Gerät erkannt. Bitte einmal Play drücken.'});

    await spotifyApi(s,'/me/player/play',{method:'PUT',body:JSON.stringify({device_id:did,uris:[String(uri)],position_ms:Math.max(0,Math.floor(Number(position_ms)||0))})});
    res.json({ok:true,device_id:did});
  }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/spotify/transfer',async(req,res)=>{try{const s=await spotifyAccess(req);const {device_id}=req.body||{};await spotifyApi(s,'/me/player',{method:'PUT',body:JSON.stringify({device_ids:[String(device_id||'')],play:false})});res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});

// -----------------------------------------------------------------------------
// Dauerhafte Quizdaten über GitHub (kostenlos, ohne Render Persistent Disk)
//
// Render darf schlafen/restarten/suspendiert werden. Die eigentlichen Quizdaten
// werden bei konfiguriertem GitHub-Speicher im Repository abgelegt. Der Token
// bleibt ausschließlich serverseitig in Render Environment Variables.
// -----------------------------------------------------------------------------
const GITHUB_OWNER = String(process.env.GITHUB_OWNER || '').trim();
const GITHUB_REPO = String(process.env.GITHUB_REPO || '').trim();
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || '').trim();
const GITHUB_BRANCH = String(process.env.GITHUB_BRANCH || 'main').trim() || 'main';
const GITHUB_DATA_PATH = String(process.env.GITHUB_DATA_PATH || 'data/fragen.json').replace(/^\/+|\/+$/g,'') || 'data/fragen.json';
const GITHUB_MEDIA_DIR = String(process.env.GITHUB_MEDIA_DIR || 'data/media').replace(/^\/+|\/+$/g,'') || 'data/media';
const githubEnabled = () => !!(GITHUB_OWNER && GITHUB_REPO && GITHUB_TOKEN);
const githubApiBase = () => `https://api.github.com/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/contents`;
const githubHeaders = () => ({
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Fragenhagel-Online'
});

async function githubRequest(filePath, options = {}) {
  if (!githubEnabled()) throw new Error('GitHub-Speicher ist nicht konfiguriert.');
  const r = await fetch(`${githubApiBase()}/${filePath.split('/').map(encodeURIComponent).join('/')}`, {
    ...options,
    headers: { ...githubHeaders(), ...(options.headers || {}) }
  });
  const text = await r.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!r.ok) {
    const e = new Error(body?.message || `GitHub API Fehler ${r.status}`);
    e.status = r.status;
    e.body = body;
    throw e;
  }
  return body;
}

async function githubGetFile(filePath) {
  return githubRequest(filePath, { method: 'GET' });
}

async function githubPutFile(filePath, contentBuffer, message) {
  const safeMessage = /\[(?:skip render|render skip|skip deploy|deploy skip)\]/i.test(String(message || ''))
    ? String(message)
    : `${String(message || 'Fragenhagel: Daten speichern')} [skip render]`;
  let sha;
  try {
    const current = await githubGetFile(filePath);
    sha = current.sha;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const body = {
    message: safeMessage,
    content: Buffer.from(contentBuffer).toString('base64'),
    branch: GITHUB_BRANCH
  };
  if (sha) body.sha = sha;
  return githubRequest(filePath, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function syncQuestionsFromGitHub() {
  if (!githubEnabled()) return { enabled: false, loaded: false };
  try {
    const file = await githubGetFile(GITHUB_DATA_PATH);
    if (!file.content) throw new Error('GitHub-Datei enthält keinen Inhalt.');
    const q = JSON.parse(Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8'));
    fs.writeFileSync(QFILE, JSON.stringify(q, null, 2), 'utf8');
    return { enabled: true, loaded: true };
  } catch (e) {
    if (e.status === 404) {
      const local = fs.readFileSync(QFILE);
      await githubPutFile(GITHUB_DATA_PATH, local, 'Fragenhagel: initiale Fragen speichern [skip render]');
      return { enabled: true, loaded: false, initialized: true };
    }
    console.error('GitHub: Fragen konnten beim Start nicht geladen werden:', e.message);
    return { enabled: true, loaded: false, error: e.message };
  }
}

async function syncMediaFromGitHub() {
  if (!githubEnabled()) return;
  try {
    const listing = await githubGetFile(GITHUB_MEDIA_DIR);
    const files = Array.isArray(listing) ? listing.filter(x => x.type === 'file') : [];
    for (const file of files) {
      if (!file.download_url && !file.path) continue;
      try {
        const body = await githubGetFile(file.path);
        if (!body.content) continue;
        const target = path.join(MEDIA, path.basename(file.path));
        fs.writeFileSync(target, Buffer.from(body.content.replace(/\n/g, ''), 'base64'));
      } catch (e) {
        console.error(`GitHub: Bild ${file.path} konnte nicht geladen werden:`, e.message);
      }
    }
  } catch (e) {
    if (e.status !== 404) console.error('GitHub: Bilder konnten beim Start nicht synchronisiert werden:', e.message);
  }
}

async function persistQuestions(q, commitMessage = 'Fragenhagel: Fragen speichern [skip render]') {
  writeQLocal(q);
  if (githubEnabled()) {
    await githubPutFile(GITHUB_DATA_PATH, Buffer.from(JSON.stringify(q, null, 2), 'utf8'), commitMessage);
  }
}

async function persistMedia(fileName, buffer, commitMessage = 'Fragenhagel: Bild speichern [skip render]') {
  if (!githubEnabled()) return;
  await githubPutFile(`${GITHUB_MEDIA_DIR}/${path.basename(fileName)}`, buffer, commitMessage);
}

const readQ = () => JSON.parse(fs.readFileSync(QFILE, 'utf8'));
const writeQLocal = q => fs.writeFileSync(QFILE, JSON.stringify(q, null, 2), 'utf8');
const writeQ = q => writeQLocal(q);
const cleanName = n => String(n || '').trim().replace(/\s+/g, ' ').slice(0, 24) || 'Gast';
const makeCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  do { out = Array.from({ length: 5 }, () => chars[crypto.randomInt(chars.length)]).join(''); }
  while (games.has(out));
  return out;
};
const token = () => crypto.randomBytes(24).toString('hex');

app.get('/api/questions', async (req, res) => {
  try {
    // Immer den aktuellsten gespeicherten Stand laden, wenn GitHub-Speicher aktiv ist.
    // Dadurch ist kein Render-Neustart nötig, damit der Editor aktuelle Daten sieht.
    if (githubEnabled()) await syncQuestionsFromGitHub();
    res.set('Cache-Control', 'no-store');
    res.json(readQ());
  } catch (e) {
    console.error('GitHub: Fragen konnten beim Laden nicht aktualisiert werden:', e.message);
    // Falls GitHub gerade nicht erreichbar ist, weiter mit dem zuletzt lokal vorhandenen Stand.
    res.set('Cache-Control', 'no-store');
    res.json(readQ());
  }
});

app.get('/api/persistence', (req, res) => res.json({
  github: githubEnabled(),
  owner: githubEnabled() ? GITHUB_OWNER : '',
  repo: githubEnabled() ? GITHUB_REPO : '',
  branch: githubEnabled() ? GITHUB_BRANCH : '',
  dataPath: githubEnabled() ? GITHUB_DATA_PATH : ''
}));

const games = new Map();
function newGame() {
  const code = makeCode();
  const game = {
    code,
    hostToken: token(),
    players: [],
    state: {
      mode: 'board', question: null, special: null,
      buzzerOpen: false, buzzedBy: null, firstBuzzedBy: null, lockedPlayers: [], faceMorphLastPartial: false, music: null
    }
  };
  games.set(code, game);
  return game;
}
function gameState(game) {
  return { code: game.code, players: game.players.map(({ id, name, score, connected }) => ({ id, name, score, connected })), ...game.state };
}
function emit(game) { io.to(`game:${game.code}`).emit('state', gameState(game)); }
function resetBuzz(game, clearFirst = true) { game.state.buzzerOpen = false; game.state.buzzedBy = null; game.state.lockedPlayers = []; game.state.faceMorphLastPartial = false; if (clearFirst) game.state.firstBuzzedBy = null; }
function hostAuthorized(req) {
  const code = String(req.headers['x-game-code'] || '').toUpperCase();
  const hostToken = String(req.headers['x-host-token'] || '');
  const game = games.get(code);
  return game && hostToken && game.hostToken === hostToken ? game : null;
}

// Editor-Zugriff darf nicht an die flüchtige Lobby im RAM gebunden sein.
// Nach einem Render-Neustart existiert die Lobby-Map nicht mehr, während
// die dauerhaft gespeicherten Quizdaten in GitHub weiter vorhanden sind.
// Deshalb verwenden die Editor-HTTP-Endpunkte zusätzlich eine stateless,
// signierte Browser-Session. Der geheime Signaturschlüssel bleibt auf dem
// Server (GITHUB_TOKEN bzw. optional EDITOR_SESSION_SECRET).
const EDITOR_SESSION_COOKIE = 'fh_editor_session';
const EDITOR_SESSION_SECRET = String(process.env.EDITOR_SESSION_SECRET || GITHUB_TOKEN || 'fragenhagel-editor-session-secret');
const editorSessionSign = value => crypto.createHmac('sha256', EDITOR_SESSION_SECRET).update(value).digest('base64url');
function editorSessionValue(code) {
  const payload = `${String(code || '').toUpperCase()}|${Date.now()}`;
  return `${payload}|${editorSessionSign(payload)}`;
}
function editorSessionAuthorized(req) {
  const code = String(req.headers['x-game-code'] || '').toUpperCase();
  if (!code) return false;
  const raw = String(req.headers.cookie || '');
  const m = raw.match(new RegExp('(?:^|;\\s*)' + EDITOR_SESSION_COOKIE + '=([^;]+)'));
  if (!m) return false;
  const value = decodeURIComponent(m[1]);
  const parts = value.split('|');
  if (parts.length !== 3) return false;
  const [cookieCode, ts, sig] = parts;
  const timestamp = Number(ts);
  if (cookieCode !== code || !Number.isFinite(timestamp) || Date.now() - timestamp > 30 * 24 * 60 * 60 * 1000) return false;
  const expected = editorSessionSign(`${cookieCode}|${ts}`);
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
}
function setEditorSessionCookie(res, code) {
  const secure = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  res.setHeader('Set-Cookie', `${EDITOR_SESSION_COOKIE}=${encodeURIComponent(editorSessionValue(code))}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=2592000`);
}
app.post('/api/player-score', (req, res) => {
  try {
    const game = hostAuthorized(req);
    if (!game) return res.status(403).json({ ok: false, error: 'Host-Berechtigung fehlt' });
    const playerName = String(req.body?.player || '').trim();
    const amount = Number(req.body?.amount);
    if (!playerName || !Number.isFinite(amount)) return res.status(400).json({ ok: false, error: 'Ungültige Punkteangabe' });
    const player = game.players.find(p => String(p.name).toLowerCase() === playerName.toLowerCase());
    if (!player) return res.status(404).json({ ok: false, error: 'Spieler nicht gefunden' });
    player.score = Number(player.score || 0) + amount;
    emit(game);
    res.json({ ok: true, player: player.name, score: player.score });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'Serverfehler' });
  }
});
app.get('/api/editor-session', (req, res) => {
  const code = String(req.query.code || req.headers['x-game-code'] || '').toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: 'Spielcode fehlt' });
  // Only the current host may mint/refresh an editor session for a lobby.
  // The previous version allowed every visitor who knew a game code to get
  // an editor cookie, which made the image-upload authorization unreliable
  // after switching lobbies.
  const game = games.get(code);
  const suppliedHostToken = String(req.headers['x-host-token'] || '');
  if (!game || !suppliedHostToken || game.hostToken !== suppliedHostToken) {
    return res.status(403).json({ ok: false, error: 'Editor-/Host-Berechtigung fehlt' });
  }
  setEditorSessionCookie(res, code);
  res.json({ ok: true });
});
function editorOrHostAuthorized(req) {
  return editorSessionAuthorized(req) || hostAuthorized(req);
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

app.put('/api/questions', async (req, res) => {
  try {
    const game = hostAuthorized(req) || games.get(String(req.headers['x-game-code'] || '').toUpperCase());
    if (!game || !editorOrHostAuthorized(req)) return res.status(403).json({ ok: false, error: 'Editor-/Host-Berechtigung fehlt' });
    await persistQuestions(req.body, 'Fragenhagel: Editor speichern');
    io.to(`game:${game.code}`).emit('questionsUpdated', readQ());
    res.json({ ok: true, persistent: githubEnabled() });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.post('/api/question-used', async (req, res) => {
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
app.post('/api/reset-used', async (req, res) => {
  try {
    const game = hostAuthorized(req);
    if (!game) return res.status(403).json({ ok: false, error: 'Host-Berechtigung fehlt' });
    const q = readQ();
    for (const c of ['YouTube-Titel', 'Back to School', 'Was bin ich?', 'Filme & Serien', 'Musik', 'Flaggen']) if (Array.isArray(q[c])) q[c].forEach(x => x.used = false);
    await persistQuestions(q, 'Fragenhagel: Felder zurücksetzen'); io.to(`game:${game.code}`).emit('questionsUpdated', q); res.json({ ok: true, persistent: githubEnabled() });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.post('/api/special-image', async (req, res) => {
  try {
    // Bild-Uploads kommen ausschließlich aus der Host-Editorseite.
    // Verwende hier bewusst dieselbe Host-Token-Prüfung wie beim normalen
    // Fragen-Speichern. Dadurch bleibt der Upload nach 'Neue Lobby'
    // zuverlässig autorisiert und hängt nicht von einer alten Editor-Cookie-Session ab.
    const game = hostAuthorized(req);
    if (!game) return res.status(403).json({ ok: false, error: 'Host-Berechtigung fehlt' });
    const { section, index, field, data, filename, fields, person1, person2 } = req.body || {};
    if (!['Face Morph', 'Wo zum Henker ist das?'].includes(section)) throw new Error('Ungültige Sonderrunde');
    const allowed = section === 'Face Morph' ? ['bild', 'original1', 'original2'] : ['bild'];
    if (!allowed.includes(field)) throw new Error('Ungültiges Bildfeld');
    const i = Number(index); const q = readQ();
    if (!q.Sonderrunden?.[section]?.[i]) throw new Error('Eintrag nicht gefunden');
    const m = String(data || '').match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
    if (!m) throw new Error('Bitte PNG, JPG, JPEG, WEBP oder GIF verwenden');
    const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    const name = `special_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
    const imageBuffer = Buffer.from(m[2], 'base64');
    fs.writeFileSync(path.join(MEDIA, name), imageBuffer);
    if (githubEnabled()) await persistMedia(name, imageBuffer, `Fragenhagel: Bild ${name} speichern`);
    // Preserve all unsaved editor fields when an image is uploaded.
    // This prevents a render/save cycle from restoring older server values.
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      for (const [key, value] of Object.entries(fields)) {
        if (key === field || key === 'bild' || key === 'original1' || key === 'original2') continue;
        q.Sonderrunden[section][i][key] = value;
      }
    }
    // Backwards-compatible Face Morph handling.
    if (section === 'Face Morph') {
      if (person1 !== undefined) q.Sonderrunden[section][i].person1 = String(person1);
      if (person2 !== undefined) q.Sonderrunden[section][i].person2 = String(person2);
    }
    q.Sonderrunden[section][i][field] = '/media/' + name;
    if (section === 'Face Morph' || section === 'Wo zum Henker ist das?') q.Sonderrunden[section][i][field + 'Name'] = String(filename || '');
    if (!req.body?.deferPersist) {
      await persistQuestions(q, `Fragenhagel: ${section} speichern`);
      io.to(`game:${game.code}`).emit('questionsUpdated', q);
    }
    res.json({ ok: true, url: '/media/' + name, item: q.Sonderrunden[section][i], persistent: githubEnabled(), deferred: Boolean(req.body?.deferPersist) });
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

  socket.on('showBoard', () => { const game = games.get(socket.data.code); if (!game || !socket.data.host) return; game.state.mode='board'; game.state.question=null; game.state.special=null; game.state.music=null; resetBuzz(game); emit(game); });
  socket.on('showQuestion', q => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; game.state.mode='question'; game.state.question={...q,revealed:false}; game.state.special=null; game.state.music=null; resetBuzz(game); emit(game); });
  socket.on('revealQuestion', () => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; if(game.state.mode==='question'&&game.state.question){game.state.question.revealed=true;emit(game);} });
  socket.on('showSpecial', x => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; game.state.mode='special'; game.state.special={...x,revealed:false}; game.state.question=null; game.state.music=(x&&x.type==='Musik'&&x.spotifyUrl)?{id:String(x.spotifyUrl),playing:false,time:0,volume:100,updatedAt:Date.now()}:null; resetBuzz(game); emit(game); });
  socket.on('revealSpecial', payload => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; if(game.state.mode==='special'&&game.state.special){if(payload&&typeof payload==='object')game.state.special={...game.state.special,...payload};game.state.special.revealed=true;emit(game);} });
  socket.on('musicControl', payload => {
    const game=games.get(socket.data.code);
    if(!game||!socket.data.host||game.state.mode!=='special'||game.state.special?.type!=='Musik')return;
    const m=game.state.music;
    if(!m)return;
    const action=String(payload?.action||'');
    const now=Date.now();
    let time=Number(payload?.time);
    if(!Number.isFinite(time)) time=m.time||0;
    if(m.playing && action!=='play') time += Math.max(0,(now-(m.updatedAt||now))/1000);
    time=Math.max(0,time);
    if(action==='load'){
      const id=String(payload?.id||'');
      if(id) m.id=id;
      m.time=0; m.playing=false;
    }else if(action==='play'){
      m.time=time; m.playing=true;
    }else if(action==='pause'){
      m.time=time; m.playing=false;
    }else if(action==='seek'){
      m.time=time;
    }else if(action==='volume'){
      m.volume=Math.max(0,Math.min(100,Number(payload?.volume)||0));
      m.time=time;
    }else if(action==='tick'){
      m.time=time;
    }else return;
    m.updatedAt=now;
    socket.to(`game:${game.code}`).emit('musicSync', {...m});
    if(action!=='tick') emit(game);
  });
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
    io.to(`game:${game.code}`).emit('gameSound', { type: 'wrong' });

    // The player who had the first buzzer is locked out for the rest of this question.
    if(!game.state.lockedPlayers.includes(p.id)) game.state.lockedPlayers.push(p.id);

    // Hide the current buzzer indication and reopen the buzzer for everyone else.
    // For Face Morph, a plain "Falsch" keeps +300 available to the next player.
    if(game.state.special?.type === 'Face Morph') game.state.faceMorphLastPartial=false;
    game.state.buzzedBy=null;
    game.state.buzzerOpen=true;
    emit(game);
  });
  socket.on('faceMorphPartial', ({ player, points }) => {
    const game=games.get(socket.data.code);
    if(!game||!socket.data.host)return;
    const p=game.players.find(x=>x.name===player);
    if(!p)return;
    const n=Number(points)||100;
    p.score+=n;
    io.to(`game:${game.code}`).emit('gameSound', { type: 'wrong' });

    // Face Morph +100: keep the points, lock this player out, and reopen the buzzer.
    // The next player may only receive +100 or Falsch until somebody is marked Falsch.
    if(!game.state.lockedPlayers.includes(p.id)) game.state.lockedPlayers.push(p.id);
    game.state.faceMorphLastPartial=true;
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
    io.to(`game:${game.code}`).emit('gameSound', { type: 'correct' });

    // End the buzzer for this question and hide the indication.
    // The first-buzzer marker is no longer needed because the question is over.
    resetBuzz(game, true);
    emit(game);
  });
  socket.on('kickPlayer', ({ playerId }, ack) => {
    const game = games.get(socket.data.code);
    if (!game || !socket.data.host) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Host-Berechtigung fehlt' });
      return;
    }

    const id = String(playerId || '');
    const index = game.players.findIndex(p => String(p.id) === id);
    if (index === -1) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Spieler nicht gefunden' });
      return;
    }

    const kicked = game.players[index];

    // Inform all sockets belonging to this player before disconnecting them.
    for (const [, client] of io.sockets.sockets) {
      if (String(client.data.code) === String(game.code) && String(client.data.playerId) === id) {
        client.emit('playerKicked', {
          name: kicked.name,
          message: 'Du wurdest vom Host aus der Lobby entfernt.'
        });
      }
    }

    game.players.splice(index, 1);

    // Disconnect every active connection of the kicked player.
    for (const [, client] of io.sockets.sockets) {
      if (String(client.data.code) === String(game.code) && String(client.data.playerId) === id) {
        client.disconnect(true);
      }
    }

    emit(game);
    if (typeof ack === 'function') ack({ ok: true, player: kicked.name });
  });

  socket.on('addPoints', ({ player, amount }, ack) => {
    const game=games.get(socket.data.code);
    if(!game || !socket.data.host){ if(typeof ack==='function') ack({ok:false,error:'Host-Berechtigung fehlt'}); return; }
    const p=game.players.find(x=>x.name===player);
    if(!p){ if(typeof ack==='function') ack({ok:false,error:'Spieler nicht gefunden'}); return; }
    const n=Number(amount);
    if(!Number.isFinite(n)){ if(typeof ack==='function') ack({ok:false,error:'Ungültige Punkte'}); return; }
    p.score+=n;
    emit(game);
    if(typeof ack==='function') ack({ok:true,player:p.name,score:p.score});
  });
  socket.on('setScore', ({ player, value }) => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; const p=game.players.find(x=>x.name===player); if(!p)return;p.score=Number(value)||0;emit(game); });
  socket.on('resetScores', () => { const game=games.get(socket.data.code); if(!game||!socket.data.host)return; game.players.forEach(p=>p.score=0);emit(game); });

  socket.on('disconnect', () => {
    const game=games.get(socket.data.code); if(!game||!socket.data.playerId)return;
    const p=game.players.find(x=>x.id===socket.data.playerId); if(p)p.connected=false; emit(game);
  });
});

const PORT = process.env.PORT || 3000;
(async () => {
  if (githubEnabled()) {
    console.log(`GitHub-Speicher aktiv: ${GITHUB_OWNER}/${GITHUB_REPO}@${GITHUB_BRANCH}`);
    await syncQuestionsFromGitHub();
    await syncMediaFromGitHub();
  } else {
    console.log('GitHub-Speicher nicht konfiguriert – lokale Fragen.json wird verwendet.');
  }
  server.listen(PORT, '0.0.0.0', () => console.log(`FRAGENHAGEL läuft auf Port ${PORT}`));
})().catch(err => {
  console.error('Start-Synchronisierung fehlgeschlagen:', err);
  server.listen(PORT, '0.0.0.0', () => console.log(`FRAGENHAGEL läuft auf Port ${PORT}`));
});
