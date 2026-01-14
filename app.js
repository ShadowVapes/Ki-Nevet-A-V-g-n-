/* Ki nevet a végén (Ludo) – ONLINE szobás multiplayer + lépés animáció
   Frontend: GitHub Pages
   State + realtime: Supabase

   TEENDŐ: írd be a SUPABASE_URL és SUPABASE_ANON_KEY értékeket.
*/
(() => {
  "use strict";

  // =======================
  // 1) SUPABASE CONFIG
  // =======================
  const SUPABASE_URL = "https://tisfsoerdufcbusslymn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_U8iceA_u25OjEaWjHkeGAw_XD99-Id-";

  const sb = (window.supabase && SUPABASE_URL.startsWith("http"))
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const $ = (sel) => document.querySelector(sel);

  // =======================
  // 2) HELPERS
  // =======================
  function escapeHtml(s) {
    return (s ?? "").replace(/[&<>"']/g, (m) => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;",
    }[m]));
  }
  function cellKey(x, y) { return `${x},${y}`; }
  function delay(ms){ return new Promise(res => setTimeout(res, ms)); }

  function getCSS(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }
  function withAlpha(hex, a) {
    const h = (hex || "#ffffff").replace("#", "");
    const r = parseInt(h.slice(0,2), 16);
    const g = parseInt(h.slice(2,4), 16);
    const b = parseInt(h.slice(4,6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function nowIso(){ return new Date().toISOString(); }
  function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

  function randomCode(len=6){
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for(let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
    return out;
  }
  function normalizeCode(s){
    return (s||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,10);
  }
  function rollDie(){
    try{
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return (a[0] % 6) + 1;
    }catch{
      return (Math.floor(Math.random()*6)+1);
    }
  }

  // =======================
  // 3) BOARD PATH (15x15)
  // =======================
  const PATH = [
    [6,0],[6,1],[6,2],[6,3],[6,4],[6,5],
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
    [0,7],[0,8],
    [1,8],[2,8],[3,8],[4,8],[5,8],
    [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
    [7,14],[8,14],
    [8,13],[8,12],[8,11],[8,10],[8,9],
    [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
    [14,7],[14,6],
    [13,6],[12,6],[11,6],[10,6],[9,6],
    [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
    [7,0],
  ];
  const PATH_SET = new Set(PATH.map(p => cellKey(p[0], p[1])));

  const COLORS = [
    { id:"green",  label:"Zöld",  hex:getCSS("--green"),  startCoord:[1,6],
      homeSlots:[[2,2],[4,2],[2,4],[4,4]],
      homeStretch:[[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
      finishSpot:[6.75, 6.75],
    },
    { id:"yellow", label:"Sárga", hex:getCSS("--yellow"), startCoord:[8,1],
      homeSlots:[[10,2],[12,2],[10,4],[12,4]],
      homeStretch:[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
      finishSpot:[8.25, 6.75],
    },
    { id:"red",    label:"Piros", hex:getCSS("--red"),   startCoord:[13,8],
      homeSlots:[[10,10],[12,10],[10,12],[12,12]],
      homeStretch:[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
      finishSpot:[8.25, 8.25],
    },
    { id:"blue",   label:"Kék",   hex:getCSS("--blue"),  startCoord:[6,13],
      homeSlots:[[2,10],[4,10],[2,12],[4,12]],
      homeStretch:[[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
      finishSpot:[6.75, 8.25],
    },
  ];

  const START_INDEX = Object.fromEntries(
    COLORS.map(c => [c.id, PATH.findIndex(p => p[0]===c.startCoord[0] && p[1]===c.startCoord[1])])
  );
  const HOME_ENTRY_INDEX = Object.fromEntries(
    Object.keys(START_INDEX).map(id => [id, (START_INDEX[id] + PATH.length - 1) % PATH.length])
  );

  // Start mezők védettek (safe)
  const SAFE_CELLS = new Set(Object.values(START_INDEX).map(i => cellKey(PATH[i][0], PATH[i][1])));

  const HOME_STRETCH_MAP = (() => {
    const m = new Map();
    for (const c of COLORS) for (const [x,y] of c.homeStretch) m.set(cellKey(x,y), { id:c.id });
    return m;
  })();

  function colorOf(colorId){
    return COLORS.find(c => c.id === colorId)?.hex || "#fff";
  }
  function startOwnerByCell(k){
    for (const c of COLORS){
      const si = START_INDEX[c.id];
      const kk = cellKey(PATH[si][0], PATH[si][1]);
      if (kk === k) return c.id;
    }
    return null;
  }

  // =======================
  // 4) DOM
  // =======================
  const elBoard = $("#board");
  const elDiceFace = $("#diceFace");
  const elDiceLabel = $("#diceLabel");
  const elBtnRoll = $("#btnRoll");
  const elBtnSkip = $("#btnSkip");
  const elHint = $("#hint");
  const elTurnName = $("#turnName");
  const elTurnDot = $("#turnDot");
  const elTurnMeta = $("#turnMeta");
  const elScore = $("#score");
  const elLog = $("#log");

  const lobbyModal = $("#lobbyModal");
  const netState = $("#netState");
  const yourName = $("#yourName");
  const roomCodeInp = $("#roomCode");
  const playerCountSel = $("#playerCount");
  const optExtraTurnOnSix = $("#optExtraTurnOnSix");
  const optAutoMove = $("#optAutoMove");
  const btnJoin = $("#btnJoin");
  const btnCreate = $("#btnCreate");
  const btnStart = $("#btnStart");
  const lobbyState = $("#lobbyState");
  const playersList = $("#playersList");
  const roomCodeBig = $("#roomCodeBig");
  const btnCopyBig = $("#btnCopyBig");

  const roomBar = $("#roomBar");
  const roomCodeText = $("#roomCodeText");
  const btnCopy = $("#btnCopy");

  const btnRules = $("#btnRules");
  const btnCloseRules = $("#btnCloseRules");
  const rulesModal = $("#rulesModal");

  const btnLeave = $("#btnLeave");

  const winModal = $("#winModal");
  const btnCloseWin = $("#btnCloseWin");
  const btnBackLobby = $("#btnBackLobby");
  const winText = $("#winText");

  // =======================
  // 5) ROOM / STATE
  // =======================
  let ui = { extraTurnOnSix:true, autoMove:true };

  let room = {
    code: null,
    hostId: null,
    meId: null,
    myColor: null,
    channel: null,
  };

  // authoritative state from DB:
  // { status:"lobby"|"playing"|"ended", hostId, settings, players[], pieces[], turnIdx, phase, die, movablePieceIds, sixStreak, winnerId, log[] }
  let state = null;
  let version = 0;

  // Animation gating
  let animLock = false;
  let pendingSnap = null;

  // Board SVG
  let svg = null;
  let gPieces = null;
  const pawnEls = new Map();

  // =======================
  // 6) NETWORK (Supabase)
  // =======================
  async function requireSupabase(){
    if (!sb){
      setHint("Supabase nincs beállítva. Add meg a kulcsokat app.js-ben.");
      netState.textContent = "no-supabase";
      netState.style.color = "var(--red)";
      throw new Error("Supabase not configured");
    }
  }

  async function fetchRoom(code){
    const { data, error } = await sb.from("rooms").select("code,state,version").eq("code", code).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function insertRoom(code, initState){
    const { data, error } = await sb.from("rooms").insert({ code, state: initState, version: 0 }).select().single();
    if (error) throw error;
    return data;
  }

  async function updateRoomState(newState, expectedVersion){
    const { data, error } = await sb
      .from("rooms")
      .update({ state: newState, version: expectedVersion + 1 })
      .eq("code", room.code)
      .eq("version", expectedVersion)
      .select("code,state,version")
      .single();

    if (error) throw error;
    return data;
  }

  async function subscribeRoom(code){
    const ch = sb.channel(`room:${code}`);

    // state updates from DB
    ch.on("postgres_changes",
      { event:"UPDATE", schema:"public", table:"rooms", filter:`code=eq.${code}` },
      (payload) => {
        const ns = payload.new.state;
        const nv = payload.new.version;
        onRemoteSnapshot(ns, nv);
      }
    );

    // broadcast move (for step animation)
    ch.on("broadcast", { event:"move" }, (payload) => {
      const p = payload?.payload;
      if (p) onRemoteMove(p);
    });

    ch.on("broadcast", { event:"sys" }, (payload) => {
      const msg = payload?.payload?.msg;
      if (msg) logLine(msg, true);
    });

    await ch.subscribe((status) => {
      netState.textContent = status;
      netState.style.color = status === "SUBSCRIBED" ? "var(--green)" : "var(--muted)";
    });

    room.channel = ch;
  }

  async function broadcast(event, payload){
    if (!room.channel) return;
    await room.channel.send({ type:"broadcast", event, payload });
  }

  function onRemoteSnapshot(newState, newVer){
    if (newVer < version) return;

    if (animLock){
      pendingSnap = { state:newState, version:newVer };
      return;
    }
    applySnapshot(newState, newVer);
  }

  function applySnapshot(newState, newVer){
    state = newState;
    version = newVer;

    renderAll();
    refreshControls();
    renderLobbyState();

    if (state?.status === "ended"){
      const w = state.players?.find(p => p.id === state.winnerId);
      if (w) openWin(w.name);
    }
  }

  async function onRemoteMove(payload){
    // payload: {toVersion, anim, state}
    const toV = payload.toVersion;
    if (toV !== undefined && toV <= version) return;

    const anim = payload.anim;
    const snap = payload.state;

    if (!anim || !snap){
      if (snap && toV !== undefined) applySnapshot(snap, toV);
      return;
    }

    animLock = true;
    try{
      await animateMove(anim);
    } finally {
      animLock = false;
    }

    if (toV !== undefined) applySnapshot(snap, toV);

    if (pendingSnap){
      const ps = pendingSnap;
      pendingSnap = null;
      applySnapshot(ps.state, ps.version);
    }
  }

  async function pushState(newState, extras){
    try{
      const upd = await updateRoomState(newState, version);
      applySnapshot(upd.state, upd.version);

      if (extras?.sysMsg) await broadcast("sys", { msg: extras.sysMsg });

      if (extras?.anim){
        await broadcast("move", {
          toVersion: upd.version,
          anim: extras.anim,
          state: upd.state
        });
      }
    } catch (e){
      // conflict -> refresh
      try{
        const rr = await fetchRoom(room.code);
        if (rr) applySnapshot(rr.state, rr.version);
      } catch {}
      logLine("Ütközés: valaki közben lépett. Próbáld újra.", true);
    }
  }

  // =======================
  // 7) GAME STATE BUILDERS
  // =======================
  function selectColors(count){
    if (count === 2) return [COLORS[0], COLORS[2]];            // green + red
    if (count === 3) return [COLORS[0], COLORS[1], COLORS[2]]; // green + yellow + red
    return COLORS.slice(0,4);
  }

  function makeInitialState(hostId, count, settings){
    const chosen = selectColors(count);

    const players = [];
    const pieces = [];

    for (const c of chosen){
      for (let i=0;i<4;i++){
        pieces.push({
          id: `${c.id}-${i}`,
          playerId: c.id, // piece belongs to colorId
          n: i,
          state: "home",
          trackIndex: null,
          stretchIndex: null
        });
      }
    }

    return {
      status: "lobby",
      hostId,
      settings: {
        playerCount: count,
        extraTurnOnSix: !!settings.extraTurnOnSix,
        autoMove: !!settings.autoMove
      },
      players,
      pieces,
      turnIdx: 0,
      phase: "needRoll",
      die: null,
      movablePieceIds: [],
      sixStreak: 0,
      winnerId: null,
      log: [`${new Date().toLocaleString()} – Szoba létrehozva.`],
      updatedAt: nowIso()
    };
  }

  function currentPlayer(s){
    return s.players[s.turnIdx] || null;
  }

  function getTrackOccupancy(s){
    const map = new Map();
    for (const piece of s.pieces){
      if (piece.state !== "track") continue;
      const [x,y] = PATH[piece.trackIndex];
      const key = cellKey(x,y);
      if (!map.has(key)) map.set(key, { countByPlayer: new Map(), pieceIds: [] });
      const b = map.get(key);
      b.pieceIds.push(piece.id);
      b.countByPlayer.set(piece.playerId, (b.countByPlayer.get(piece.playerId)||0) + 1);
    }
    return map;
  }

  // blokkolás: ha a célmezőn 2 ellenfél bábu van (dupla), oda nem érkezhetsz
  function isTrackLandingAllowed(s, colorId, coord){
    const occ = getTrackOccupancy(s);
    const key = cellKey(coord[0], coord[1]);
    const bucket = occ.get(key);
    if (!bucket) return true;

    for (const [pid, cnt] of bucket.countByPlayer.entries()){
      if (pid !== colorId && cnt >= 2) return false;
    }
    return true;
  }

  function computeLegalMove(s, piece, die){
    if (!die) return null;
    const colorId = piece.playerId;

    if (piece.state === "finished") return null;

    // home -> start on 6
    if (piece.state === "home"){
      if (die !== 6) return null;
      const ti = START_INDEX[colorId];
      if (!isTrackLandingAllowed(s, colorId, PATH[ti])) return null;
      return { state:"track", trackIndex:ti, stretchIndex:null };
    }

    // track
    if (piece.state === "track"){
      const cur = piece.trackIndex;
      const entry = HOME_ENTRY_INDEX[colorId];
      const distToEntry = (entry - cur + PATH.length) % PATH.length;

      // marad a külső körön
      if (die <= distToEntry){
        const ni = (cur + die) % PATH.length;
        if (!isTrackLandingAllowed(s, colorId, PATH[ni])) return null;
        return { state:"track", trackIndex:ni, stretchIndex:null };
      }

      // belép a hazafutóba
      const into = die - distToEntry - 1;
      if (into < 0 || into > 5) return null;
      return { state:"homeStretch", trackIndex:null, stretchIndex:into };
    }

    // home stretch
    if (piece.state === "homeStretch"){
      const ni = piece.stretchIndex + die;
      if (ni > 6) return null;
      if (ni === 6) return { state:"finished", trackIndex:null, stretchIndex:null };
      return { state:"homeStretch", trackIndex:null, stretchIndex:ni };
    }

    return null;
  }

  function updateMovablePieceIds(s){
    const cp = currentPlayer(s);
    if (!cp) return [];
    const die = s.die;
    const out = [];
    for (const piece of s.pieces){
      if (piece.playerId !== cp.colorId) continue;
      if (computeLegalMove(s, piece, die)) out.push(piece.id);
    }
    return out;
  }

  function applyMoveToState(prev, pieceId, mv){
    const s = deepClone(prev);
    const piece = s.pieces.find(p => p.id === pieceId);
    if (!piece) return s;

    const actor = currentPlayer(s);

    // move
    piece.state = mv.state;
    piece.trackIndex = mv.trackIndex ?? null;
    piece.stretchIndex = mv.stretchIndex ?? null;

    // capture
    if (piece.state === "track"){
      const coord = PATH[piece.trackIndex];
      const key = cellKey(coord[0], coord[1]);
      const safe = SAFE_CELLS.has(key);

      if (!safe){
        const victims = s.pieces.filter(pp =>
          pp.id !== piece.id &&
          pp.state === "track" &&
          pp.trackIndex === piece.trackIndex &&
          pp.playerId !== piece.playerId
        );
        if (victims.length){
          for (const v of victims){
            v.state = "home";
            v.trackIndex = null;
            v.stretchIndex = null;
          }
          s.log.unshift(`${actor.name} ütött: ${victims.length} bábu haza.`);
        }
      }
    }

    // finish
    if (piece.state === "finished"){
      actor.finished = (actor.finished || 0) + 1;
      s.log.unshift(`${actor.name} beért! (${actor.finished}/4)`);
    }

    if (s.log.length > 60) s.log.length = 60;

    return s;
  }

  function nextTurnInState(prev, extra){
    const s = deepClone(prev);
    if (!extra){
      s.turnIdx = (s.turnIdx + 1) % s.players.length;
      s.sixStreak = 0;
    }
    s.phase = "needRoll";
    s.die = null;
    s.movablePieceIds = [];
    s.updatedAt = nowIso();
    return s;
  }

  // =======================
  // 8) PERMISSIONS
  // =======================
  function isMyTurn(){
    if (!state || state.status !== "playing") return false;
    const cp = currentPlayer(state);
    return !!cp && cp.id === room.meId;
  }
  function canRoll(){
    return state && state.status === "playing" && state.phase === "needRoll" && isMyTurn();
  }
  function canPick(pieceId){
    return state && state.status === "playing" && state.phase === "needPick" && isMyTurn() && (state.movablePieceIds||[]).includes(pieceId);
  }

  // =======================
  // 9) ACTIONS
  // =======================
  async function actRoll(){
    if (!canRoll()) return;

    const die = rollDie();
    const s = deepClone(state);
    s.die = die;
    s.phase = "needPick";
    s.updatedAt = nowIso();
    s.log.unshift(`${currentPlayer(s).name} dobott: ${die}.`);
    s.movablePieceIds = updateMovablePieceIds(s);

    if (s.movablePieceIds.length === 0){
      s.log.unshift(`${currentPlayer(s).name}: nincs lépés.`);
      const s2 = nextTurnInState(s, false);
      await pushState(s2, null);
      return;
    }

    await pushState(s, null);

    if (s.settings.autoMove && s.movablePieceIds.length === 1){
      await delay(240);
      if (state && state.phase === "needPick" && isMyTurn() && state.movablePieceIds.length === 1){
        await actPick(state.movablePieceIds[0]);
      }
    }
  }

  function buildAnim(prev, piece, mv){
    const steps = [];
    const captures = [];

    const cxy = (coord) => ({ x: coord[0] + 0.5, y: coord[1] + 0.5 });

    // start position
    steps.push(pieceToPos(prev, piece));

    const colorId = piece.playerId;
    const c = COLORS.find(x => x.id === colorId);

    // home -> start
    if (piece.state === "home" && mv.state === "track"){
      steps.push(cxy(PATH[mv.trackIndex]));
    }

    // track moves
    else if (piece.state === "track"){
      const cur = piece.trackIndex;
      const entry = HOME_ENTRY_INDEX[colorId];
      const distToEntry = (entry - cur + PATH.length) % PATH.length;
      const die = prev.die;

      if (mv.state === "track"){
        for (let i=1;i<=die;i++){
          const idx = (cur + i) % PATH.length;
          steps.push(cxy(PATH[idx]));
        }
      } else if (mv.state === "homeStretch"){
        // to entry+1 then into stretch
        for (let i=1;i<=distToEntry+1;i++){
          const idx = (cur + i) % PATH.length;
          steps.push(cxy(PATH[idx]));
        }
        for (let j=0;j<=mv.stretchIndex;j++){
          steps.push(cxy(c.homeStretch[j]));
        }
      }
    }

    // home stretch -> finish
    else if (piece.state === "homeStretch"){
      const start = piece.stretchIndex;
      const end = mv.state === "finished" ? 6 : mv.stretchIndex;
      for (let i=start+1;i<=end;i++){
        if (i === 6){
          steps.push({ x:c.finishSpot[0], y:c.finishSpot[1] });
        } else {
          steps.push({ x:c.homeStretch[i][0]+0.5, y:c.homeStretch[i][1]+0.5 });
        }
      }
    }

    // capture check from prev if landing on track
    if ((piece.state === "home" && mv.state === "track") || (piece.state === "track" && mv.state === "track")){
      const landing = mv.trackIndex;
      const coord = PATH[landing];
      const key = cellKey(coord[0], coord[1]);
      if (!SAFE_CELLS.has(key)){
        const victims = prev.pieces.filter(pp =>
          pp.id !== piece.id &&
          pp.state === "track" &&
          pp.trackIndex === landing &&
          pp.playerId !== piece.playerId
        );
        for (const v of victims) captures.push(v.id);
      }
    }

    return { pieceId: piece.id, steps, captures };
  }

  async function actPick(pieceId){
    if (!canPick(pieceId)) return;

    const piece = state.pieces.find(p => p.id === pieceId);
    if (!piece) return;

    const mv = computeLegalMove(state, piece, state.die);
    if (!mv) return;

    const anim = buildAnim(state, piece, mv);
    let s2 = applyMoveToState(state, pieceId, mv);

    // win?
    const cpAfter = currentPlayer(s2);
    if (cpAfter && (cpAfter.finished || 0) >= 4){
      s2.status = "ended";
      s2.phase = "ended";
      s2.winnerId = cpAfter.id;
      s2.log.unshift(`${cpAfter.name} nyert!`);
      s2.updatedAt = nowIso();
      await pushState(s2, { anim, sysMsg: `${cpAfter.name} NYERT.` });
      return;
    }

    // extra turn on 6
    const extra = (s2.settings.extraTurnOnSix && state.die === 6);
    if (extra){
      s2.sixStreak = (s2.sixStreak || 0) + 1;
      if (s2.sixStreak >= 3){
        s2.log.unshift(`${cpAfter.name} 3x hatos. Kör tovább.`);
        s2 = nextTurnInState(s2, false);
      } else {
        s2.log.unshift(`${cpAfter.name} 6-os! Még egy dobás.`);
        s2 = nextTurnInState(s2, true);
      }
    } else {
      s2 = nextTurnInState(s2, false);
    }

    await pushState(s2, { anim });
  }

  // =======================
  // 10) LOBBY
  // =======================
  function setHint(msg){ elHint.textContent = msg; }
  function meName(){
    const n = (yourName.value || "").trim();
    return n.length ? n.slice(0,18) : null;
  }

  function openLobby(){
    lobbyModal.classList.add("show");
    lobbyModal.setAttribute("aria-hidden","false");
    btnLeave.disabled = true;
    roomBar.hidden = true;
    setHint("Create vagy Join.");
    refreshControls();
  }
  function closeLobby(){
    lobbyModal.classList.remove("show");
    lobbyModal.setAttribute("aria-hidden","true");
    btnLeave.disabled = !room.code;
  }

  function showLobbyState(){
    lobbyState.hidden = false;
    roomCodeBig.textContent = room.code;
    btnStart.hidden = (room.meId !== state.hostId);
    btnJoin.hidden = true;
    btnCreate.hidden = true;

    roomBar.hidden = false;
    roomCodeText.textContent = room.code;
  }

  function renderLobbyState(){
    if (!state || !room.code) return;
    if (lobbyModal.classList.contains("show")) lobbyState.hidden = false;

    playersList.innerHTML = "";
    const need = state.settings?.playerCount || 4;
    const chosen = selectColors(need).map(c => c.id);

    for (const cid of chosen){
      const pl = state.players.find(p => p.colorId === cid);
      const card = document.createElement("div");
      card.className = "pcard";

      const left = document.createElement("div");
      left.className = "left";

      const dot = document.createElement("div");
      dot.className = "dot";
      dot.style.background = colorOf(cid);

      const nm = document.createElement("div");
      nm.className = "nm";
      nm.textContent = pl ? pl.name : "— üres —";

      left.appendChild(dot);
      left.appendChild(nm);

      const st = document.createElement("div");
      st.className = "st";
      st.textContent = pl ? (pl.id === state.hostId ? "host" : "ready") : "waiting";

      card.appendChild(left);
      card.appendChild(st);
      playersList.appendChild(card);
    }
  }

  async function createRoomFlow(){
    await requireSupabase();

    const name = meName();
    if (!name) return setHint("Írd be a neved.");

    const count = Number(playerCountSel.value);
    ui.extraTurnOnSix = !!optExtraTurnOnSix.checked;
    ui.autoMove = !!optAutoMove.checked;

    const hostId = crypto.randomUUID();
    room.meId = hostId;
    room.hostId = hostId;

    let code = normalizeCode(roomCodeInp.value);
    if (!code) code = randomCode(6);

    const init = makeInitialState(hostId, count, ui);

    const chosen = selectColors(count);
    const myColor = chosen[0].id;
    room.myColor = myColor;

    init.players.push({
      id: room.meId,
      colorId: myColor,
      name,
      finished: 0,
      joinedAt: nowIso(),
      isHost: true
    });
    init.log.unshift(`${name} (host) belépett: ${COLORS.find(c=>c.id===myColor).label}.`);

    // insert with collision retry
    let inserted = null;
    for (let i=0;i<4;i++){
      try{
        inserted = await insertRoom(code, init);
        break;
      }catch{
        code = randomCode(6);
      }
    }
    if (!inserted) return setHint("Nem sikerült szobát létrehozni.");

    room.code = inserted.code;

    await subscribeRoom(room.code);
    applySnapshot(inserted.state, inserted.version);

    showLobbyState();
    closeLobby();
    setHint("Szoba kész. Küldd a kódot, aztán Start.");
  }

  async function joinRoomFlow(){
    await requireSupabase();

    const name = meName();
    if (!name) return setHint("Írd be a neved.");

    const code = normalizeCode(roomCodeInp.value);
    if (!code) return setHint("Kell a kód Join-hoz.");

    const rr = await fetchRoom(code);
    if (!rr) return setHint("Nincs ilyen szoba.");

    room.code = rr.code;
    room.hostId = rr.state.hostId;
    room.meId = crypto.randomUUID();

    await subscribeRoom(room.code);
    applySnapshot(rr.state, rr.version);

    if (state.status !== "lobby"){
      room.myColor = null;
      closeLobby();
      setHint("A szoba már megy. Néző módban vagy.");
      refreshControls();
      return;
    }

    const need = state.settings.playerCount;
    const chosen = selectColors(need).map(c => c.id);
    const used = new Set(state.players.map(p => p.colorId));
    const free = chosen.find(cid => !used.has(cid));

    if (!free){
      room.myColor = null;
      closeLobby();
      setHint("Tele a szoba. Néző módban vagy.");
      refreshControls();
      return;
    }

    room.myColor = free;

    const s2 = deepClone(state);
    s2.players.push({
      id: room.meId,
      colorId: free,
      name,
      finished: 0,
      joinedAt: nowIso(),
      isHost: false
    });
    s2.log.unshift(`${name} belépett: ${COLORS.find(c=>c.id===free).label}.`);
    s2.updatedAt = nowIso();

    await pushState(s2, { sysMsg: `${name} joined.` });

    showLobbyState();
    closeLobby();
    setHint("Bent vagy. Várjátok meg a Startot.");
  }

  async function startGameFlow(){
    if (!state || state.status !== "lobby") return;
    if (room.meId !== state.hostId) return;

    const need = state.settings.playerCount;
    if (state.players.length < need) return setHint(`Még nincs meg a létszám (${state.players.length}/${need}).`);

    const s2 = deepClone(state);
    s2.status = "playing";
    s2.turnIdx = 0;
    s2.phase = "needRoll";
    s2.die = null;
    s2.movablePieceIds = [];
    s2.sixStreak = 0;
    s2.log.unshift("Játék indult.");
    s2.updatedAt = nowIso();

    await pushState(s2, { sysMsg: "Game started." });
    closeLobby();
    setHint("Mehet. Dobj.");
  }

  async function leaveRoomFlow(){
    if (!room.code) return;

    try{
      if (room.channel) await room.channel.unsubscribe();
    }catch{}

    room = { code:null, hostId:null, meId:null, myColor:null, channel:null };
    state = null;
    version = 0;
    animLock = false;
    pendingSnap = null;

    clearBoardPieces();
    renderAll();
    refreshControls();
    openLobby();
    setHint("Kiléptél.");
  }

  // =======================
  // 11) UI: log / dice / score / turn
  // =======================
  function setDice(face, label){
    elDiceFace.textContent = face;
    elDiceLabel.textContent = label;
  }

  function logLine(msg, muted=false){
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = msg;
    if (!muted) div.style.color = "var(--text)";
    elLog.prepend(div);
    while (elLog.children.length > 40) elLog.removeChild(elLog.lastChild);
  }

  function refreshControls(){
    const playing = state && state.status === "playing";
    elBtnRoll.disabled = !(playing && canRoll());
    elBtnSkip.disabled = !(playing && isMyTurn());
    btnLeave.disabled = !room.code;

    if (!state){
      setDice("—","—");
      return;
    }
    if (state.status === "lobby"){
      setDice("—","Várakozás");
      return;
    }
    setDice(state.die ? String(state.die) : "—", state.phase === "needRoll" ? "Dobásra vár" : "Válassz bábut");
  }

  function renderScore(){
    elScore.innerHTML = "";
    if (!state) return;

    const pls = state.players || [];
    for (const p of pls){
      const card = document.createElement("div");
      card.className = "card";

      const left = document.createElement("div");
      left.className = "left";

      const dot = document.createElement("div");
      dot.className = "c-dot";
      dot.style.background = colorOf(p.colorId);

      const nm = document.createElement("div");
      nm.className = "name";
      nm.textContent = p.name;

      left.appendChild(dot);
      left.appendChild(nm);

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${p.finished || 0}/4`;

      card.appendChild(left);
      card.appendChild(meta);
      elScore.appendChild(card);
    }

    if (pls.length === 3){
      const pad = document.createElement("div");
      pad.className = "card";
      pad.style.opacity = "0";
      elScore.appendChild(pad);
    }
  }

  function renderTurn(){
    if (!state || !state.players?.length){
      elTurnName.textContent = "—";
      elTurnDot.style.background = "rgba(255,255,255,.25)";
      elTurnMeta.textContent = "—";
      return;
    }

    if (state.status === "lobby"){
      const need = state.settings.playerCount;
      elTurnName.textContent = "Lobby";
      elTurnDot.style.background = "rgba(255,255,255,.25)";
      elTurnMeta.textContent = `Létszám: ${state.players.length}/${need} • Host indít`;
      return;
    }

    const cp = currentPlayer(state);
    elTurnName.textContent = cp ? cp.name : "—";
    elTurnDot.style.background = cp ? colorOf(cp.colorId) : "rgba(255,255,255,.25)";
    const my = (cp && cp.id === room.meId) ? " (te)" : "";
    elTurnMeta.textContent = `Kör: ${state.turnIdx+1}/${state.players.length}${my}`;
  }

  function renderLogFromState(){
    elLog.innerHTML = "";
    if (!state) return;
    (state.log || []).slice(0, 30).forEach(line => {
      const div = document.createElement("div");
      div.className = "item";
      div.textContent = line;
      elLog.appendChild(div);
    });
  }

  // =======================
  // 12) BOARD RENDER (SVG)
  // =======================
  function buildBoardIfNeeded(){
    if (svg) return;

    elBoard.innerHTML = "";
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox","0 0 15 15");
    svg.setAttribute("preserveAspectRatio","xMidYMid meet");

    for (let y=0;y<15;y++){
      for (let x=0;x<15;x++){
        const rect = document.createElementNS(svg.namespaceURI,"rect");
        rect.setAttribute("x",x);
        rect.setAttribute("y",y);
        rect.setAttribute("width",1);
        rect.setAttribute("height",1);
        const info = getCellInfo(x,y);
        rect.setAttribute("fill", info.fill);
        rect.setAttribute("class", `cell ${info.cls}`);
        svg.appendChild(rect);

        if (SAFE_CELLS.has(cellKey(x,y))){
          const dot = document.createElementNS(svg.namespaceURI,"circle");
          dot.setAttribute("cx", x+0.5);
          dot.setAttribute("cy", y+0.5);
          dot.setAttribute("r", 0.08);
          dot.setAttribute("fill", "rgba(255,255,255,.55)");
          svg.appendChild(dot);
        }
      }
    }

    const tris = [
      { pts: "6,6 7.5,7.5 6,9", fill: withAlpha(getCSS("--green"), 0.45) },
      { pts: "6,6 7.5,7.5 9,6", fill: withAlpha(getCSS("--yellow"), 0.45) },
      { pts: "9,9 7.5,7.5 9,6", fill: withAlpha(getCSS("--red"), 0.45) },
      { pts: "6,9 7.5,7.5 9,9", fill: withAlpha(getCSS("--blue"), 0.45) },
    ];
    for (const t of tris){
      const poly = document.createElementNS(svg.namespaceURI,"polygon");
      poly.setAttribute("points", t.pts);
      poly.setAttribute("fill", t.fill);
      poly.setAttribute("class","center");
      svg.appendChild(poly);
    }

    const tx = document.createElementNS(svg.namespaceURI,"text");
    tx.setAttribute("x","7.5");
    tx.setAttribute("y","7.9");
    tx.setAttribute("text-anchor","middle");
    tx.setAttribute("font-size","0.65");
    tx.setAttribute("font-weight","900");
    tx.setAttribute("fill","rgba(255,255,255,.22)");
    tx.textContent = "HOME";
    svg.appendChild(tx);

    gPieces = document.createElementNS(svg.namespaceURI,"g");
    svg.appendChild(gPieces);

    elBoard.appendChild(svg);
  }

  function getCellInfo(x,y){
    const bg = "#0b0f14";
    const pathBg = "#121a22";
    const centerBg = "#0f1620";

    const inGreenHome = (x<=5 && y<=5);
    const inYellowHome = (x>=9 && y<=5);
    const inBlueHome = (x<=5 && y>=9);
    const inRedHome = (x>=9 && y>=9);
    const inCenter = (x>=6 && x<=8 && y>=6 && y<=8);

    const k = cellKey(x,y);
    const isPath = PATH_SET.has(k);
    const hs = HOME_STRETCH_MAP.get(k);

    if (inCenter) return { fill:centerBg, cls:"center" };
    if (inGreenHome) return { fill: withAlpha(getCSS("--green"), 0.08), cls:"" };
    if (inYellowHome) return { fill: withAlpha(getCSS("--yellow"), 0.085), cls:"" };
    if (inRedHome) return { fill: withAlpha(getCSS("--red"), 0.085), cls:"" };
    if (inBlueHome) return { fill: withAlpha(getCSS("--blue"), 0.085), cls:"" };

    if (hs) return { fill: withAlpha(colorOf(hs.id), 0.20), cls:"path" };

    if (isPath){
      if (SAFE_CELLS.has(k)){
        const id = startOwnerByCell(k);
        return { fill: withAlpha(colorOf(id), 0.22), cls:"path" };
      }
      return { fill: pathBg, cls:"path" };
    }
    return { fill:bg, cls:"" };
  }

  function clearBoardPieces(){
    if (gPieces) gPieces.innerHTML = "";
    pawnEls.clear();
  }

  function ensurePawnEls(){
    if (!state || !gPieces) return;

    const ids = new Set(state.pieces.map(p => p.id));
    const needRebuild = (pawnEls.size !== ids.size) || ([...pawnEls.keys()].some(k => !ids.has(k)));
    if (!needRebuild) return;

    pawnEls.clear();
    gPieces.innerHTML = "";

    for (const piece of state.pieces){
      const g = document.createElementNS(svg.namespaceURI,"g");
      g.setAttribute("class","pawn");
      g.dataset.pieceId = piece.id;

      const ring = document.createElementNS(svg.namespaceURI,"circle");
      ring.setAttribute("class","ring");
      ring.setAttribute("r","0.38");
      ring.setAttribute("stroke", withAlpha(colorOf(piece.playerId), 0.85));

      const body = document.createElementNS(svg.namespaceURI,"circle");
      body.setAttribute("r","0.26");
      body.setAttribute("fill", colorOf(piece.playerId));
      body.setAttribute("stroke","rgba(255,255,255,.28)");
      body.setAttribute("stroke-width","0.07");

      const shine = document.createElementNS(svg.namespaceURI,"circle");
      shine.setAttribute("r","0.10");
      shine.setAttribute("fill","rgba(255,255,255,.18)");
      shine.setAttribute("cx","-0.08");
      shine.setAttribute("cy","-0.08");

      const hit = document.createElementNS(svg.namespaceURI,"circle");
      hit.setAttribute("class","hit");
      hit.setAttribute("r","0.55");
      hit.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        const id = g.dataset.pieceId;
        if (canPick(id)) actPick(id);
      });

      g.appendChild(ring);
      g.appendChild(body);
      g.appendChild(shine);
      g.appendChild(hit);

      gPieces.appendChild(g);
      pawnEls.set(piece.id, g);
    }
  }

  function stackOffsets(n){
    const o = 0.18;
    if (n === 2) return [{dx:-o,dy:0},{dx:o,dy:0}];
    if (n === 3) return [{dx:-o,dy:-o/2},{dx:o,dy:-o/2},{dx:0,dy:o}];
    return [{dx:-o,dy:-o},{dx:o,dy:-o},{dx:-o,dy:o},{dx:o,dy:o}];
  }

  function pieceToPos(s, piece){
    const c = COLORS.find(x => x.id === piece.playerId);

    if (piece.state === "home"){
      const [x,y] = c.homeSlots[piece.n];
      return { x:x+0.5, y:y+0.5 };
    }
    if (piece.state === "track"){
      const [x,y] = PATH[piece.trackIndex];
      return { x:x+0.5, y:y+0.5 };
    }
    if (piece.state === "homeStretch"){
      const [x,y] = c.homeStretch[piece.stretchIndex];
      return { x:x+0.5, y:y+0.5 };
    }
    if (piece.state === "finished"){
      const pl = s.players.find(p => p.colorId === piece.playerId);
      const i = Math.max(0, (pl?.finished || 1) - 1);
      const off = stackOffsets(4)[i];
      return { x: c.finishSpot[0] + off.dx*0.7, y: c.finishSpot[1] + off.dy*0.7 };
    }
    return { x:7.5, y:7.5 };
  }

  function renderPieces(){
    if (!state) return;

    const positions = new Map();
    const buckets = new Map();

    for (const piece of state.pieces){
      const base = pieceToPos(state, piece);
      positions.set(piece.id, base);

      const key = piece.state === "finished" ? `fin:${piece.playerId}`
        : piece.state === "home" ? `home:${piece.playerId}:${piece.n}`
        : `cell:${Math.floor(base.x)},${Math.floor(base.y)}`;

      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(piece.id);
    }

    for (const ids of buckets.values()){
      if (ids.length <= 1) continue;
      const offs = stackOffsets(Math.min(4, ids.length));
      ids.forEach((id, idx) => {
        const p = positions.get(id);
        const o = offs[idx % offs.length];
        positions.set(id, { x:p.x + o.dx, y:p.y + o.dy });
      });
    }

    for (const piece of state.pieces){
      const g = pawnEls.get(piece.id);
      if (!g) continue;

      const pos = positions.get(piece.id);
      g.setAttribute("transform", `translate(${pos.x}, ${pos.y})`);

      const movable = (state.status === "playing" && state.phase === "needPick" && isMyTurn() && (state.movablePieceIds||[]).includes(piece.id));
      g.classList.toggle("movable", movable);
      g.style.opacity = piece.state === "finished" ? "0.85" : "1";
    }
  }

  // =======================
  // 13) ANIMATION
  // =======================
  async function animateMove(anim){
    const g = pawnEls.get(anim.pieceId);
    if (!g) return;

    g.classList.add("animating");
    try{
      for (let i=0;i<anim.steps.length;i++){
        const p = anim.steps[i];
        g.setAttribute("transform", `translate(${p.x}, ${p.y})`);
        await delay(i === 0 ? 40 : 90);
      }

      if (anim.captures?.length){
        for (const vid of anim.captures){
          const vg = pawnEls.get(vid);
          if (!vg) continue;
          vg.style.transition = "opacity 120ms ease";
          vg.style.opacity = "0.15";
          await delay(120);
          vg.style.opacity = "1";
          vg.style.transition = "";
        }
      }
    } finally {
      g.classList.remove("animating");
    }
  }

  // =======================
  // 14) MODALS
  // =======================
  function openRules(){ rulesModal.classList.add("show"); rulesModal.setAttribute("aria-hidden","false"); }
  function closeRules(){ rulesModal.classList.remove("show"); rulesModal.setAttribute("aria-hidden","true"); }

  function openWin(name){
    winText.innerHTML = `<b>${escapeHtml(name)}</b> nyert. GG.`;
    winModal.classList.add("show");
    winModal.setAttribute("aria-hidden","false");
  }
  function closeWin(){
    winModal.classList.remove("show");
    winModal.setAttribute("aria-hidden","true");
  }

  // =======================
  // 15) RENDER ALL
  // =======================
  function renderAll(){
    buildBoardIfNeeded();
    renderTurn();
    renderScore();
    renderLogFromState();
    ensurePawnEls();
    renderPieces();
    refreshControls();
  }

  // =======================
  // 16) WIRES
  // =======================
  elBtnRoll.addEventListener("click", actRoll);

  elBtnSkip.addEventListener("click", async () => {
    if (!state || state.status !== "playing" || !isMyTurn()) return;
    const s2 = nextTurnInState(state, false);
    s2.log.unshift(`${currentPlayer(state).name} passzolt.`);
    await pushState(s2, null);
  });

  btnJoin.addEventListener("click", () => joinRoomFlow().catch(()=>setHint("Join hiba.")));
  btnCreate.addEventListener("click", () => createRoomFlow().catch(()=>setHint("Create hiba.")));
  btnStart.addEventListener("click", () => startGameFlow().catch(()=>setHint("Start hiba.")));

  btnLeave.addEventListener("click", () => leaveRoomFlow());

  function copyCode(){
    if (!room.code) return;
    navigator.clipboard?.writeText(room.code);
    setHint("Kód másolva.");
  }
  btnCopy.addEventListener("click", copyCode);
  btnCopyBig.addEventListener("click", copyCode);

  btnRules.addEventListener("click", openRules);
  btnCloseRules.addEventListener("click", closeRules);
  rulesModal.addEventListener("pointerdown", (e) => { if (e.target === rulesModal) closeRules(); });

  btnCloseWin.addEventListener("click", closeWin);
  btnBackLobby.addEventListener("click", () => { closeWin(); openLobby(); });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape"){ closeRules(); closeWin(); }
    if ((e.key === " " || e.key === "Enter") && canRoll()){
      e.preventDefault();
      actRoll();
    }
  });

  // init
  renderAll();
  openLobby();

  if (sb){
    netState.textContent = "ready";
    netState.style.color = "var(--yellow)";
  } else {
    netState.textContent = "no-supabase";
    netState.style.color = "var(--red)";
  }
})();
