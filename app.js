(() => {
  "use strict";

  // =======================
  // SUPABASE CONFIG
  // =======================
  const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL_HERE";
  const SUPABASE_ANON_KEY = "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

  const sb = (window.supabase && SUPABASE_URL.startsWith("http"))
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const OFFLINE = !sb;

  const $ = (sel) => document.querySelector(sel);

  // =======================
  // HELPERS
  // =======================
  const delay = (ms) => new Promise(res => setTimeout(res, ms));
  const nowIso = () => new Date().toISOString();
  const deepClone = (o) => JSON.parse(JSON.stringify(o));
  const cellKey = (x,y) => `${x},${y}`;

  function normalizeCode(s){
    return (s||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,10);
  }
  function randomCode(len=6){
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for(let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
    return out;
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
  function getCSS(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function withAlpha(hex, a){
    const h = (hex || "#ffffff").replace("#","");
    const r = parseInt(h.slice(0,2),16);
    const g = parseInt(h.slice(2,4),16);
    const b = parseInt(h.slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function escapeHtml(s){
    return (s ?? "").replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;",
    }[m]));
  }

  // =======================
  // BOARD PATH (15x15)
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
  // FIX: a haladási irány fordítva kellett
  PATH.reverse();

  const PATH_SET = new Set(PATH.map(p => cellKey(p[0],p[1])));

  const COLORS = [
    { id:"green",  label:"Zöld",  hex:getCSS("--green"),  startCoord:[1,6],
      homeSlots:[[1,1],[4,1],[1,4],[4,4]],
      homeStretch:[[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
      finishSpot:[6.75, 6.75],
    },
    { id:"yellow", label:"Sárga", hex:getCSS("--yellow"), startCoord:[8,1],
      homeSlots:[[10,1],[13,1],[10,4],[13,4]],
      homeStretch:[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
      finishSpot:[8.25, 6.75],
    },
    { id:"red",    label:"Piros", hex:getCSS("--red"),   startCoord:[13,8],
      homeSlots:[[10,10],[13,10],[10,13],[13,13]],
      homeStretch:[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
      finishSpot:[8.25, 8.25],
    },
    { id:"blue",   label:"Kék",   hex:getCSS("--blue"),  startCoord:[6,13],
      homeSlots:[[1,10],[4,10],[1,13],[4,13]],
      homeStretch:[[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
      finishSpot:[6.75, 8.25],
    },
  ];

  const START_INDEX = Object.fromEntries(
    COLORS.map(c => [c.id, PATH.findIndex(p => p[0]===c.startCoord[0] && p[1]===c.startCoord[1])])
  );

  // Entry = az a track mező, ahonnan 1 lépéssel be tudsz menni a homeStretch[0]-ra
  const HOME_ENTRY_INDEX = (() => {
    const out = {};
    for (const c of COLORS){
      const [hx, hy] = c.homeStretch[0];
      const neigh = [
        [hx-1, hy],
        [hx+1, hy],
        [hx, hy-1],
        [hx, hy+1],
      ];
      let entry = null;
      for (const [nx, ny] of neigh){
        if (PATH_SET.has(cellKey(nx, ny))){ entry = [nx, ny]; break; }
      }
      const idx = entry ? PATH.findIndex(p => p[0]===entry[0] && p[1]===entry[1]) : -1;
      out[c.id] = idx >= 0 ? idx : (START_INDEX[c.id] + PATH.length - 1) % PATH.length;
    }
    return out;
  })();

  // Safe: start mezők (mindenkinek safe)
  const SAFE_START_CELLS = new Set(Object.values(START_INDEX).map(i => cellKey(PATH[i][0], PATH[i][1])));

  // Saját színű védett track szegmens (játékos kérésére): start után 5 mező
  const COLORED_TRACK = new Map(); // colorId -> Set(trackIndex)
  for (const c of COLORS){
    const si = START_INDEX[c.id];
    const set = new Set();
    for (let k=0;k<6;k++) set.add((si + k) % PATH.length); // start + 5
    COLORED_TRACK.set(c.id, set);
  }
  const isProtectedTrackForColor = (colorId, trackIndex) => {
    const s = COLORED_TRACK.get(colorId);
    return !!s && s.has(trackIndex);
  };

  const HOME_STRETCH_MAP = (() => {
    const m = new Map();
    for (const c of COLORS) for (const [x,y] of c.homeStretch) m.set(cellKey(x,y), { id:c.id });
    return m;
  })();

  function colorHex(colorId){ return COLORS.find(c => c.id === colorId)?.hex || "#fff"; }

  function startOwnerByCell(k){
    for (const c of COLORS){
      const si = START_INDEX[c.id];
      const kk = cellKey(PATH[si][0], PATH[si][1]);
      if (kk === k) return c.id;
    }
    return null;
  }

  // =======================
  // DOM
  // =======================
  const elBoard = $("#board");
  const elBoardHelp = $("#boardHelp");

  const elBtnStartMain = $("#btnStartMain");
  const elBtnRoll = $("#btnRoll");
  const elBtnSkip = $("#btnSkip");

  const elHint = $("#hint");
  const elTurnName = $("#turnName");
  const elTurnDot = $("#turnDot");
  const elTurnMeta = $("#turnMeta");

  const elScore = $("#score");
  const elLog = $("#log");

  const netState = $("#netState");
  const netState2 = $("#netState2");

  const lobbyModal = $("#lobbyModal");
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

  const mobileRoomOverlay = $("#mobileRoomOverlay");
  const mobileRoomCodeText = $("#mobileRoomCodeText");

  const btnRules = $("#btnRules");
  const btnCloseRules = $("#btnCloseRules");
  const rulesModal = $("#rulesModal");

  const btnLeave = $("#btnLeave");

  const winModal = $("#winModal");
  const btnCloseWin = $("#btnCloseWin");
  const btnBackLobby = $("#btnBackLobby");
  const winText = $("#winText");

  // =======================
  // ROOM / STATE
  // =======================
  let ui = { extraTurnOnSix:true, autoMove:true };

  let room = {
    code: null,
    hostId: null,
    meId: null,
    myColor: null,
    channel: null,
  };

  let state = null;
  let version = 0;

  // animation gating
  let animLock = false;
  let pendingSnap = null;

  // polling fallback
  let pollTimer = null;
  let realtimeSubbed = false;

  // =======================
  // VIEW (fixed per player)
  // =======================
  function isMobile(){
    return !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
  }

  function myColorId(){
    // Everyone should see their *own* color in the bottom-left.
    // In online rooms we already know our assigned color (room.myColor)
    // even before our player row is present in the room state.
    if (OFFLINE){
      return room.myColor || state?.players?.[0]?.colorId || 'blue';
    }
    if (room.myColor) return room.myColor;
    const me = state?.players?.find(p => p.id === room.meId);
    return me?.colorId || null;
  }

  function angleForColor(colorId){
    // Goal: everyone sees their OWN color in the bottom-left corner.
    // Default board corners: green=top-left, yellow=top-right, red=bottom-right, blue=bottom-left.
    // To bring each color's home-corner to bottom-left we rotate the board CLOCKWISE (SVG y-down):
    // blue (already bottom-left) -> 0°
    // green (top-left -> bottom-left) -> 90°
    // yellow (top-right -> bottom-left) -> 180°
    // red (bottom-right -> bottom-left) -> 270°
    switch(colorId){
      case 'blue': return 0;
      case 'green': return 90;
      case 'yellow': return 180;
      case 'red': return 270;
      default: return 0;
    }
  }

  function rotatePointCW(p, deg){
    const a = (deg * Math.PI) / 180;
    const cx = 7.5, cy = 7.5;
    const x = p.x - cx;
    const y = p.y - cy;
    const cos = Math.cos(a), sin = Math.sin(a);
    // Match SVG rotate() direction (positive degrees rotate clockwise in SVG because Y axis points down)
    const xr = x*cos - y*sin;
    const yr = x*sin + y*cos;
    return { x: xr + cx, y: yr + cy };
  }

  function mapPos(p){
    return rotatePointCW(p, viewAngleDeg);
  }

  function updateViewAngle(){
    const a = angleForColor(myColorId());
    if (a !== viewAngleDeg){
      viewAngleDeg = a;
      if (gBoard) gBoard.setAttribute('transform', `rotate(${viewAngleDeg} 7.5 7.5)`);
    }
  }

  function refreshMobileRoomOverlay(){
    if (!mobileRoomOverlay || !mobileRoomCodeText) return;
    const show = isMobile() && !!room.code && !!state && room.meId && state.hostId && room.meId === state.hostId;
    mobileRoomOverlay.hidden = !show;
    if (show) mobileRoomCodeText.textContent = room.code;
  }


  // SVG
  let svg = null;
  let gPieces = null;
  let gTargets = null;
  let gBoard = null;
  let gLabels = null;
  let viewAngleDeg = 0;
  let uiDiceRolling = false;
  let uiRollLockUntil = 0; // timestamp: while > now, do not reveal movable pieces/targets

  const ROLL_ANIM_MS = 1000;
  const ROLL_SYNC_BUFFER_MS = 220;
  const MOVE_STEP_MS_FIRST = 140;
  const MOVE_STEP_MS = 220;
  const POST_MOVE_PAUSE_MS = 1000;

  let diceG = null;
  let diceInnerG = null;
  let diceRect = null;
  let diceFaceText = null;
  let dicePlayerText = null;
  let diceHintText = null;
  const pawnEls = new Map();
  const labelEls = new Map();

  // =======================
  // NETWORK
  // =======================
  async function requireSupabase(){
    if (!sb){
      // OFFLINE mód: nincs realtime, de a játék fusson helyben
      setNet("offline", "var(--yellow)");
      return false;
    }
    return true;
  }

  function setNet(txt, color){
    netState.textContent = txt;
    netState2.textContent = txt;
    if (color){
      netState.style.color = color;
      netState2.style.color = color;
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

    ch.on("postgres_changes",
      { event:"UPDATE", schema:"public", table:"rooms", filter:`code=eq.${code}` },
      (payload) => onRemoteSnapshot(payload.new.state, payload.new.version)
    );

    ch.on("broadcast", { event:"move" }, (payload) => {
      const p = payload?.payload;
      if (p) onRemoteMove(p);
    });

    ch.on("broadcast", { event:"roll" }, (payload) => {
      const p = payload?.payload;
      if (p) onRemoteRoll(p);
    });

    await ch.subscribe((status) => {
      realtimeSubbed = (status === 'SUBSCRIBED');
      setNet(status, realtimeSubbed ? 'var(--green)' : 'var(--muted)');
      // polling csak fallback (ha realtime nem ok)
      if (realtimeSubbed) stopPolling();
      else startPolling();
    });

    room.channel = ch;
  }

  async function broadcast(event, payload){
    if (!room.channel) return;
    await room.channel.send({ type:"broadcast", event, payload });
  }

  function startPolling(){
    if (pollTimer) return;
    if (realtimeSubbed) return;
    pollTimer = setInterval(async () => {
      if (!room.code) return;
      if (animLock) return;
      try{
        const rr = await fetchRoom(room.code);
        if (rr && rr.version > version) onRemoteSnapshot(rr.state, rr.version);
      }catch{}
    }, 2000);
  }

  function stopPolling(){
    if (pollTimer){
      clearInterval(pollTimer);
      pollTimer = null;
    }
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

    syncUiRollLockFromState();
    renderAll();
    refreshControls();
    renderLobbyState();

    if (state?.status === "ended"){
      const w = state.players?.find(p => p.id === state.winnerId);
      if (w) openWin(w.name);
    }
  }

  async function onRemoteMove(payload){
    const toV = payload.toVersion;
    if (toV !== undefined && toV <= version) return;

    if (payload.anim){
      animLock = true;
      try{
        await animateMove(payload.anim);
      } finally {
        animLock = false;
      }
    }

    // state snapshot
    if (payload.state && toV !== undefined) applySnapshot(payload.state, toV);

    if (pendingSnap){
      const ps = pendingSnap; pendingSnap = null;
      applySnapshot(ps.state, ps.version);
    }
  }

  async function onRemoteRoll(payload){
    // csak vizuális anim + toast, a state snapshot úgyis jön DB-ből
    if (payload?.die){
      diceRollAnim(payload.die, payload.startAt ?? null, payload.durationMs ?? ROLL_ANIM_MS);
    }
    // nincs dobás-log (csak animáció)
  }

  async function pushState(newState, extras){
    // OFFLINE: nincs DB/realtime, csak helyben frissítünk + animálunk
    if (!sb){
      version = (version || 0) + 1;

      if (extras?.rollAnim?.die){
        diceRollAnim(extras.rollAnim.die, extras.rollAnim.startAt ?? null, extras.rollAnim.durationMs ?? ROLL_ANIM_MS);
      }

      if (extras?.moveAnim){
        animLock = true;
        try{ await animateMove(extras.moveAnim); } finally { animLock = false; }
      }

      applySnapshot(newState, version);
      return;
    }

    try{
      const upd = await updateRoomState(newState, version);

      if (extras?.rollAnim){
        await broadcast('roll', {
          toVersion: upd.version,
          die: extras.rollAnim.die,
          byName: extras.rollAnim.byName,
          colorId: extras.rollAnim.colorId,
          startAt: extras.rollAnim.startAt ?? null,
          durationMs: extras.rollAnim.durationMs ?? ROLL_ANIM_MS
        });
      }

      if (extras?.moveAnim){
        // local: anim BEFORE applying the snapshot, so dice/turn color stays until animation end
        animLock = true;
        try{
          await animateMove(extras.moveAnim);
        } finally {
          animLock = false;
        }
        applySnapshot(upd.state, upd.version);

        await broadcast('move', {
          toVersion: upd.version,
          anim: extras.moveAnim,
          state: upd.state
        });
        return;
      }

      applySnapshot(upd.state, upd.version);
    } catch (e){
      try{
        const rr = await fetchRoom(room.code);
        if (rr) applySnapshot(rr.state, rr.version);
      } catch {}
      toast('Ütközés / desync: frissítettem a szobát.');
    }
  }

  // =======================
  // GAME LOGIC
  // =======================
  function selectColors(count){
    if (count === 2) return [COLORS[0], COLORS[2]];             // zöld + piros
    if (count === 3) return [COLORS[0], COLORS[1], COLORS[2]];  // zöld + sárga + piros
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
          playerId: c.id,
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
      lastRoll: null, // FIX: mindig megmarad, hogy mások is lássák
      log: [`${new Date().toLocaleString()} – Szoba létrehozva.`],
      updatedAt: nowIso()
    };
  }

  function currentPlayer(s){ return s.players[s.turnIdx] || null; }

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

  function isTrackLandingAllowed(s, colorId, coord){
    // Kérés: bármennyi bábu stackelődhessen egy mezőn (nincs 'fal' / blokkolás)
    return true;
  }

  function computeLegalMove(s, piece, die){
    if (!die) return null;
    const colorId = piece.playerId;

    if (piece.state === "finished") return null;

    // home -> start csak 6-ra
    if (piece.state === "home"){
      if (die !== 6) return null;
      const ti = START_INDEX[colorId];
      if (!isTrackLandingAllowed(s, colorId, PATH[ti])) return null;
      return { state:"track", trackIndex:ti, stretchIndex:null };
    }

    // track mozgás
    if (piece.state === "track"){
      const cur = piece.trackIndex;
      const entry = HOME_ENTRY_INDEX[colorId];
      const distToEntry = (entry - cur + PATH.length) % PATH.length;

      // ha még nem éred el az entry-t, sima track
      if (die <= distToEntry){
        const ni = (cur + die) % PATH.length;
        if (!isTrackLandingAllowed(s, colorId, PATH[ni])) return null;
        return { state:"track", trackIndex:ni, stretchIndex:null };
      }

      // különben entry-ig elmész, majd 1 lépés = homeStretch[0]
      const into = die - distToEntry - 1; // FIX: így biztos entry után lép be
      if (into < 0 || into > 5) return null;
      return { state:"homeStretch", trackIndex:null, stretchIndex:into };
    }

    // homeStretch (bounce: túldobásnál falig, majd vissza)
    if (piece.state === "homeStretch"){
      const raw = piece.stretchIndex + die;
      if (raw == 6) return { state:"finished", trackIndex:null, stretchIndex:null };
      if (raw < 6) return { state:"homeStretch", trackIndex:null, stretchIndex:raw };
      const over = raw - 6;
      const back = 6 - over;
      return { state:"homeStretch", trackIndex:null, stretchIndex:back };
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

  function pieceToPos(s, piece){
    const c = COLORS.find(x => x.id === piece.playerId);

    let p = { x:7.5, y:7.5 };

    if (piece.state === 'home'){
      const [x,y] = c.homeSlots[piece.n];
      p = { x:x+0.5, y:y+0.5 };
    }
    else if (piece.state === 'track'){
      const [x,y] = PATH[piece.trackIndex];
      p = { x:x+0.5, y:y+0.5 };
    }
    else if (piece.state === 'homeStretch'){
      const [x,y] = c.homeStretch[piece.stretchIndex];
      p = { x:x+0.5, y:y+0.5 };
    }
    else if (piece.state === 'finished'){
      p = { x: c.finishSpot[0], y: c.finishSpot[1] };
    }

    return mapPos(p);
  }

  function applyMoveToState(prev, pieceId, mv){
    const s = deepClone(prev);
    const piece = s.pieces.find(p => p.id === pieceId);
    if (!piece) return s;

    const actor = currentPlayer(s);

    piece.state = mv.state;
    piece.trackIndex = mv.trackIndex ?? null;
    piece.stretchIndex = mv.stretchIndex ?? null;

    // CAPTURE (csak track-en)
    if (piece.state === "track"){
      const victims = s.pieces.filter(pp =>
        pp.id !== piece.id &&
        pp.state === "track" &&
        pp.trackIndex === piece.trackIndex &&
        pp.playerId !== piece.playerId
      );

      if (victims.length){
        const knocked = [];
        const protectedVictims = [];

        for (const v of victims){
          // Spawn protection: csak akkor védett, ha a saját színének START mezőjén áll.
          const spawnIdx = START_INDEX[v.playerId];
          const isSpawnSafe = (spawnIdx !== undefined && v.trackIndex === spawnIdx);
          if (isSpawnSafe) protectedVictims.push(v);
          else knocked.push(v);
        }

        for (const v of knocked){
          v.state = "home";
          v.trackIndex = null;
          v.stretchIndex = null;
        }

        if (knocked.length){
          s.log.unshift(`${actor.name} ütött: ${knocked.length} bábu haza.`);
        } else if (protectedVictims.length){
          s.log.unshift(`${actor.name} próbált ütni, de védett (spawn).`);
        }
      }
    }

    // finish
    if (piece.state === "finished"){
      const pl = s.players.find(p => p.id === actor.id);
      if (pl){
        pl.finished = (pl.finished || 0) + 1;
        s.log.unshift(`${actor.name} beért! (${pl.finished}/4)`);
      }
    }

    if (s.log.length > 30) s.log.length = 30;
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
  // PERMISSIONS
  // =======================
  function isMyTurn(){
    if (!state || state.status !== "playing") return false;
    if (OFFLINE) return true;
    const cp = currentPlayer(state);
    return !!cp && cp.id === room.meId;
  }
  function canRoll(){
    return state && state.status === "playing" && state.phase === "needRoll" && isMyTurn();
  }
  function canPick(pieceId){
    return state && state.status === "playing" && state.phase === "needPick" && !uiDiceRolling && isMyTurn() && (state.movablePieceIds||[]).includes(pieceId);
  }

  // =======================
  // VISUAL: dice anim + toast
  // =======================
  function toast(msg){
    setHint(msg);
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = msg;
    elLog.prepend(div);
    while (elLog.children.length > 45) elLog.removeChild(elLog.lastChild);
  }

  function setDiceFace(n){
    if (!diceFaceText) return;
    diceFaceText.textContent = String(n ?? "—");
  }

  function syncUiRollLockFromState(){
    if (!state || !state.lastRoll) return;
    // If we received a DB snapshot first (before realtime roll event),
    // suppress pick/targets for the duration of the roll animation.
    const now = Date.now();
    const at = Number(state.lastRoll.at || 0);
    if (!at) return;
    const until = at + ROLL_SYNC_BUFFER_MS + ROLL_ANIM_MS;
    if (now < until){
      uiRollLockUntil = Math.max(uiRollLockUntil, until);
      uiDiceRolling = true;
    }
  }

  async function diceRollAnim(finalDie, startAt=null, durationMs=ROLL_ANIM_MS){
    if (!diceInnerG) return;

    // start sync: wait until startAt, but mark rolling immediately so UI won't reveal targets/face early
    uiDiceRolling = true;
    // Hide move previews until the dice animation has fully finished
    renderPieces();
    renderTargets();
    renderDiceOverlay();

    const st = startAt ?? Date.now();
    uiRollLockUntil = Math.max(uiRollLockUntil, st + durationMs);
    const wait = st - Date.now();
    if (wait > 0) await delay(wait);

    diceInnerG.classList.add('diceRolling');

    const endAt = st + durationMs;
    while (Date.now() < endAt){
      setDiceFace((Math.floor(Math.random()*6) + 1));
      await delay(70);
    }

    setDiceFace(finalDie);
    await delay(120);
    diceInnerG.classList.remove('diceRolling');

    uiDiceRolling = (Date.now() < uiRollLockUntil);
    renderPieces();
    renderTargets();
    refreshControls();
  }

  // =======================
  // ACTIONS
  // =======================
  async function actRoll(){
    if (!canRoll()) return;

    const die = rollDie();
    const startAt = Date.now() + ROLL_SYNC_BUFFER_MS;

    // local: start the roll animation synced (others receive the same startAt via broadcast)
    diceRollAnim(die, startAt, ROLL_ANIM_MS);

    const s = deepClone(state);
    const cp = currentPlayer(s);

    s.die = die;
    s.phase = 'needPick';
    s.updatedAt = nowIso();

    // lastRoll megmarad
    s.lastRoll = { byId: cp.id, byName: cp.name, colorId: cp.colorId, die, at: Date.now() };
    s.movablePieceIds = updateMovablePieceIds(s);

    if (s.movablePieceIds.length === 0){
      // No legal move: keep current player's dice color until roll anim ends + 1s, then pass turn
      s.log.unshift(`${cp.name}: nincs lépés.`);
      s.phase = 'pause';
      await pushState(s, { rollAnim:{ die, byName: cp.name, colorId: cp.colorId, startAt, durationMs: ROLL_ANIM_MS } });

      const until = startAt + ROLL_ANIM_MS + POST_MOVE_PAUSE_MS;
      const wait = until - Date.now();
      if (wait > 0) await delay(wait);

      // Only the current player advances the turn (prevents double-advance)
      if (state && state.status === 'playing' && isMyTurn() && state.phase === 'pause' && state.die === die){
        const s2 = nextTurnInState(state, false);
        await pushState(s2, null);
      }
      return;
    }

    await pushState(s, { rollAnim:{ die, byName: cp.name, colorId: cp.colorId, startAt, durationMs: ROLL_ANIM_MS } });
    // auto-move: ha csak 1 opció van, automatikusan lép (de csak dobás anim után)
    if ((s.settings?.autoMove ?? true) && s.movablePieceIds.length === 1){
      const pickAt = startAt + ROLL_ANIM_MS + 20;
      const wait = pickAt - Date.now();
      if (wait > 0) await delay(wait);

      if (state && state.phase === 'needPick' && isMyTurn() && state.movablePieceIds.length === 1){
        await actPick(state.movablePieceIds[0]);
      }
    }
  }

  function buildMoveAnim(prev, piece, mv){
    const steps = [];
    const captures = [];

    const cxy = (coord) => mapPos({ x: coord[0] + 0.5, y: coord[1] + 0.5 });
    steps.push(pieceToPos(prev, piece));

    const colorId = piece.playerId;
    const c = COLORS.find(x => x.id === colorId);
    const die = prev.die;

    if (piece.state === "home" && mv.state === "track"){
      steps.push(cxy(PATH[mv.trackIndex]));
    }
    else if (piece.state === "track"){
      const cur = piece.trackIndex;
      const entry = HOME_ENTRY_INDEX[colorId];
      const distToEntry = (entry - cur + PATH.length) % PATH.length;

      if (mv.state === "track"){
        for (let i=1;i<=die;i++){
          const idx = (cur + i) % PATH.length;
          steps.push(cxy(PATH[idx]));
        }
      } else if (mv.state === "homeStretch"){
        // FIX: előbb entry-ig megy (distToEntry lépés), aztán homeStretch[0..]
        for (let i=1;i<=distToEntry;i++){
          const idx = (cur + i) % PATH.length;
          steps.push(cxy(PATH[idx]));
        }
        for (let j=0;j<=mv.stretchIndex;j++){
          steps.push(cxy(c.homeStretch[j]));
        }
      }
    }
    else if (piece.state === "homeStretch"){
      const start = piece.stretchIndex;
      const raw = start + die;

      if (mv.state === "finished"){
        for (let i=start+1;i<=6;i++){
          if (i === 6) steps.push(mapPos({ x:c.finishSpot[0], y:c.finishSpot[1] }));
          else steps.push(cxy(c.homeStretch[i]));
        }
      } else {
        // bounce: if raw > 6, go to finish then step back
        if (raw <= 5){
          for (let i=start+1;i<=raw;i++){
            steps.push(cxy(c.homeStretch[i]));
          }
        } else {
          for (let i=start+1;i<=6;i++){
            if (i === 6) steps.push(mapPos({ x:c.finishSpot[0], y:c.finishSpot[1] }));
            else steps.push(cxy(c.homeStretch[i]));
          }
          for (let i=5;i>=mv.stretchIndex;i--){
            steps.push(cxy(c.homeStretch[i]));
          }
        }
      }
    }

    // capture check (landing on track)
    if ((piece.state === "home" && mv.state === "track") || (piece.state === "track" && mv.state === "track")){
      const landing = mv.trackIndex;
      const coord = PATH[landing];
      const key = cellKey(coord[0], coord[1]);

      // start mezők nem globálisan safe-ek; csak a saját színű védett szegmens véd
      const victims = prev.pieces.filter(pp =>
        pp.id !== piece.id &&
        pp.state === "track" &&
        pp.trackIndex === landing &&
        pp.playerId !== piece.playerId
      );
      for (const v of victims){
        if (!isProtectedTrackForColor(v.playerId, v.trackIndex)){
          captures.push(v.id);
        }
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

    const anim = buildMoveAnim(state, piece, mv);
    let s2 = applyMoveToState(state, pieceId, mv);

    // win?
    const cpAfter = currentPlayer(s2);
    const plAfter = s2.players.find(p => p.id === cpAfter.id);
    if (plAfter && (plAfter.finished || 0) >= 4){
      s2.status = "ended";
      s2.phase = "ended";
      s2.winnerId = cpAfter.id;
      s2.log.unshift(`${cpAfter.name} nyert!`);
      s2.updatedAt = nowIso();
      await pushState(s2, { moveAnim: anim });
      return;
    }

    // extra turn: 6-osnál mindig + beérésnél is (nem stackelődik duplán)
    const finishedThisMove = (mv.state === 'finished');
    const extra = (s2.settings.extraTurnOnSix && state.die === 6) || finishedThisMove;

    if (extra){
      if (finishedThisMove && state.die === 6){
        s2.log.unshift(`${cpAfter.name} 6-tal beért! +1 dobás.`);
      } else if (finishedThisMove){
        s2.log.unshift(`${cpAfter.name} beért! +1 dobás.`);
      } else {
        s2.log.unshift(`${cpAfter.name} 6-os! Még egy dobás.`);
      }
      s2 = nextTurnInState(s2, true);
    } else {
      s2 = nextTurnInState(s2, false);
    }

    await pushState(s2, { moveAnim: anim });
  }

  // =======================
  // LOBBY
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

    // only host sees room code (desktop too); on mobile it is shown via overlay
    const isHost2 = (room.meId === state.hostId);
    roomBar.hidden = !isHost2;
    if (isHost2) roomCodeText.textContent = room.code;

    // lobby modal: only host sees code/copy row
    try{
      const row = lobbyState.querySelector('.row');
      if (row) row.style.display = isHost2 ? '' : 'none';
    }catch{}
  }

  function renderLobbyState(){
    if (!state || !room.code) return;
    playersList.innerHTML = "";

    const chosen = selectColors(state.settings?.playerCount || 4).map(c => c.id);
    for (const cid of chosen){
      const pl = state.players.find(p => p.colorId === cid);
      const card = document.createElement("div");
      card.className = "pcard";

      const left = document.createElement("div");
      left.className = "left";

      const dot = document.createElement("div");
      dot.className = "dot";
      dot.style.background = colorHex(cid);

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

    // OFFLINE mód: helyi lobby (hot-seat), nincs szobakód/join
    if (!sb){
      const count = Number(playerCountSel.value);
      ui.extraTurnOnSix = !!optExtraTurnOnSix.checked;
      ui.autoMove = !!optAutoMove.checked;

      const hostId = crypto.randomUUID();
      room.meId = hostId;
      room.hostId = hostId;
      room.code = "OFFLINE";

      const init = makeInitialState(hostId, count, ui);
      const chosen = selectColors(count);
      room.myColor = chosen[0].id;

      // feltöltjük a játékosokat (hot-seat)
      for (let i=0;i<count;i++){
        const c = chosen[i].id;
        init.players.push({
          id: i===0 ? hostId : crypto.randomUUID(),
          colorId: c,
          name: i===0 ? name : `Játékos ${i+1}`,
          finished: 0,
          joinedAt: nowIso(),
          isHost: i===0
        });
      }
      init.log.unshift(`${name} (offline host) létrehozta a játékot.`);

      setNet("offline", "var(--yellow)");
      applySnapshot(init, 0);
      showLobbyState();
      closeLobby();
      setHint("OFFLINE mód: hot-seat játék. Host indít: Start (min. 2 fő). ");
      refreshControls();
      return;
    }

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

    let inserted = null;
    for (let i=0;i<5;i++){
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
    startPolling();

    applySnapshot(inserted.state, inserted.version);
    showLobbyState();

    closeLobby();
    setHint("Szoba kész. Küldd a kódot, aztán Start (min. 2 fő).");
  }

  async function joinRoomFlow(){
    await requireSupabase();

    if (!sb){
      setHint("OFFLINE módban nincs Join (nincs Supabase). Nyomj Create.");
      return;
    }

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
    startPolling();

    applySnapshot(rr.state, rr.version);

    if (state.status !== "lobby"){
      room.myColor = null;
      closeLobby();
      setHint("A szoba már megy. Néző módban vagy.");
      refreshControls();
      return;
    }

    const chosen = selectColors(state.settings.playerCount).map(c => c.id);
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

    await pushState(s2, null);

    showLobbyState();
    closeLobby();
    setHint("Bent vagy. Várjátok a Startot (min. 2 fő).");
  }

  async function startGameFlow(){
    if (!state || state.status !== "lobby") return;
    if (room.meId !== state.hostId) return;

    if ((state.players?.length || 0) < 2){
      return setHint(`Minimum 2 játékos kell (${state.players.length}/2).`);
    }

    const s2 = deepClone(state);

    // aktív színek = akik ténylegesen bent vannak
    const activeColors = new Set(s2.players.map(p => p.colorId));

    // csak aktív színek bábui maradnak
    s2.pieces = s2.pieces.filter(pc => activeColors.has(pc.playerId));

    // lock a tényleges létszámra
    s2.settings.playerCount = s2.players.length;

    s2.status = "playing";
    s2.turnIdx = 0;
    s2.phase = "needRoll";
    s2.die = null;
    s2.movablePieceIds = [];
    s2.sixStreak = 0;
    s2.log.unshift(`Játék indult (${s2.players.length} fő).`);
    s2.updatedAt = nowIso();

    await pushState(s2, null);
    closeLobby();
    setHint("Mehet. Katt a kockára.");
  }

  async function leaveRoomFlow(){
    if (!room.code) return;

    stopPolling();
    try{ if (room.channel) await room.channel.unsubscribe(); }catch{}

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
  // UI: turn + score + log
  // =======================
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
      dot.style.background = colorHex(p.colorId);

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
      elTurnName.textContent = "Lobby";
      elTurnDot.style.background = "rgba(255,255,255,.25)";
      elTurnMeta.textContent = `Bent: ${state.players.length} • Start: min. 2 fő (host)`;
      return;
    }

    const cp = currentPlayer(state);
    elTurnName.textContent = cp ? cp.name : "—";
    elTurnDot.style.background = cp ? colorHex(cp.colorId) : "rgba(255,255,255,.25)";
    const my = (cp && cp.id === room.meId) ? " (te)" : "";
    const lr = state.lastRoll ? ` • Utolsó dobás: ${state.lastRoll.byName}=${state.lastRoll.die}` : "";
    elTurnMeta.textContent = `Kör: ${state.turnIdx+1}/${state.players.length}${my}${lr}`;
  }

  function renderLogFromState(){
    elLog.innerHTML = "";
    if (!state) return;
    (state.log || []).slice(0, 32).forEach(line => {
      const div = document.createElement("div");
      div.className = "item";
      div.textContent = line;
      elLog.appendChild(div);
    });
  }

  function refreshControls(){
    const inRoom = !!room.code && !!state;
    const isLobby = inRoom && state.status === "lobby";
    const isPlaying = inRoom && state.status === "playing";
    const isHost = isLobby && room.meId === state.hostId;

    elBtnStartMain.hidden = !isLobby;
    elBtnStartMain.disabled = !(isHost && (state.players?.length || 0) >= 2);

    btnStart.hidden = !(isHost && isLobby);
    btnStart.disabled = !(isHost && isLobby && (state?.players?.length || 0) >= 2);

    // roll backup gomb
    elBtnRoll.disabled = !(isPlaying && canRoll());
    elBtnSkip.disabled = !(isPlaying && isMyTurn());

    btnLeave.disabled = !room.code;

    // board help szöveg
    if (!state || state.status !== "playing"){
      elBoardHelp.textContent = "A játék a kockán keresztül megy. Lobbyban Startol a host.";
    } else {
      elBoardHelp.textContent = canRoll()
        ? "Te jössz: katt a kockára dobáshoz."
        : "Várj a körödre…";
    }

    // dice enabled/disabled vizuál
    if (diceG){
      diceG.classList.toggle("diceDisabled", !(isPlaying && (canRoll() || (isMyTurn() && state.phase === "needPick"))));
    }
  }

  // =======================
  // BOARD RENDER (SVG + dice + targets)
  // =======================
  function buildBoardIfNeeded(){
    if (svg) return;

    elBoard.innerHTML = '';
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox','0 0 15 15');
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');

    // rotated board layer (fixed per player)
    gBoard = document.createElementNS(svg.namespaceURI,'g');
    gBoard.setAttribute('class','boardLayer');
    svg.appendChild(gBoard);

    // cells
    for (let y=0;y<15;y++){
      for (let x=0;x<15;x++){
        const rect = document.createElementNS(svg.namespaceURI,'rect');
        rect.setAttribute('x',x);
        rect.setAttribute('y',y);
        rect.setAttribute('width',1);
        rect.setAttribute('height',1);

        const info = getCellInfo(x,y);
        rect.setAttribute('fill', info.fill);
        rect.setAttribute('class', `cell ${info.cls}`);
        gBoard.appendChild(rect);

        // start dots
        if (SAFE_START_CELLS.has(cellKey(x,y))){
          const dot = document.createElementNS(svg.namespaceURI,'circle');
          dot.setAttribute('cx', x+0.5);
          dot.setAttribute('cy', y+0.5);
          dot.setAttribute('r', 0.10);
          dot.setAttribute('fill', 'rgba(255,255,255,.70)');
          gBoard.appendChild(dot);
        }
      }
    }

    // center decoration
    const tris = [
      { pts: '6,6 7.5,7.5 6,9', fill: withAlpha(getCSS('--green'), 0.30) },
      { pts: '6,6 7.5,7.5 9,6', fill: withAlpha(getCSS('--yellow'), 0.30) },
      { pts: '9,9 7.5,7.5 9,6', fill: withAlpha(getCSS('--red'), 0.30) },
      { pts: '6,9 7.5,7.5 9,9', fill: withAlpha(getCSS('--blue'), 0.30) },
    ];
    for (const t of tris){
      const poly = document.createElementNS(svg.namespaceURI,'polygon');
      poly.setAttribute('points', t.pts);
      poly.setAttribute('fill', t.fill);
      poly.setAttribute('class','center');
      gBoard.appendChild(poly);
    }

    // labels (names) layer (NOT rotated; positions are mapped)
    gLabels = document.createElementNS(svg.namespaceURI,'g');
    gLabels.setAttribute('class','labelsLayer');
    svg.appendChild(gLabels);

    // targets layer (NOT rotated; positions are mapped)
    gTargets = document.createElementNS(svg.namespaceURI,'g');
    svg.appendChild(gTargets);

    // pieces layer (NOT rotated; positions are mapped)
    gPieces = document.createElementNS(svg.namespaceURI,'g');
    svg.appendChild(gPieces);

    // center dice (on top; not rotated)
    buildCenterDice();

    elBoard.appendChild(svg);

    updateViewAngle();
    renderLabels();
  }

  function getCellInfo(x,y){
    const bg = "#f7f7f7";
    const pathBg = "#ffffff";
    const centerBg = "#ffffff";

    const inGreenHome = (x<=5 && y<=5);
    const inYellowHome = (x>=9 && y<=5);
    const inBlueHome = (x<=5 && y>=9);
    const inRedHome = (x>=9 && y>=9);
    const inCenter = (x>=6 && x<=8 && y>=6 && y<=8);

    // classic: belső fehér 'otthon' 4x4
    const innerGreen = (x>=1 && x<=4 && y>=1 && y<=4);
    const innerYellow = (x>=10 && x<=13 && y>=1 && y<=4);
    const innerBlue = (x>=1 && x<=4 && y>=10 && y<=13);
    const innerRed = (x>=10 && x<=13 && y>=10 && y<=13);

    const k = cellKey(x,y);
    const isPath = PATH_SET.has(k);
    const hs = HOME_STRETCH_MAP.get(k);

    if (inCenter) return { fill:centerBg, cls:"center" };

    // home quadrants (solid like classic ludo)
    if (inGreenHome) return { fill: innerGreen ? "#ffffff" : colorHex("green"), cls:"" };
    if (inYellowHome) return { fill: innerYellow ? "#ffffff" : colorHex("yellow"), cls:"" };
    if (inRedHome) return { fill: innerRed ? "#ffffff" : colorHex("red"), cls:"" };
    if (inBlueHome) return { fill: innerBlue ? "#ffffff" : colorHex("blue"), cls:"" };

    // home stretch = solid color lane
    if (hs) return { fill: colorHex(hs.id), cls:"path" };

    // track/path
    if (isPath){
      const owner = startOwnerByCell(k);
      if (owner) return { fill: colorHex(owner), cls:'path start' };
      return { fill: pathBg, cls:'path' };
    }

    return { fill:bg, cls:"" };
  }

  function buildCenterDice(){
    diceG = document.createElementNS(svg.namespaceURI,"g");
    diceG.setAttribute("class","diceRoot");
    // közép környéke
    diceG.setAttribute("transform","translate(7.5 7.05)");
    svg.appendChild(diceG);

    // belső group, hogy a CSS transform ne üsse felül a fenti translate-et
    diceInnerG = document.createElementNS(svg.namespaceURI,"g");
    diceInnerG.setAttribute("class","diceInner");
    diceG.appendChild(diceInnerG);

    diceRect = document.createElementNS(svg.namespaceURI,"rect");
    diceRect.setAttribute("x","-1.05");
    diceRect.setAttribute("y","-0.95");
    diceRect.setAttribute("width","2.10");
    diceRect.setAttribute("height","1.90");
    diceRect.setAttribute("rx","0.35");
    diceRect.setAttribute("class","diceBox");
    diceRect.setAttribute("stroke","rgba(0,0,0,.35)");
    diceRect.setAttribute("fill","rgba(255,255,255,.92)");
    diceInnerG.appendChild(diceRect);

    diceFaceText = document.createElementNS(svg.namespaceURI,"text");
    diceFaceText.setAttribute("x","0");
    diceFaceText.setAttribute("y","0.25");
    diceFaceText.setAttribute("text-anchor","middle");
    diceFaceText.setAttribute("class","diceFaceText");
    diceFaceText.textContent = "—";
    diceInnerG.appendChild(diceFaceText);

    dicePlayerText = document.createElementNS(svg.namespaceURI,"text");
    dicePlayerText.setAttribute("x","0");
    dicePlayerText.setAttribute("y","1.18");
    dicePlayerText.setAttribute("text-anchor","middle");
    dicePlayerText.setAttribute("class","diceSubText");
    dicePlayerText.textContent = "";
    diceInnerG.appendChild(dicePlayerText);

    diceHintText = document.createElementNS(svg.namespaceURI,"text");
    diceHintText.setAttribute("x","0");
    diceHintText.setAttribute("y","1.65");
    diceHintText.setAttribute("text-anchor","middle");
    diceHintText.setAttribute("class","diceHintText");
    diceHintText.textContent = "";
    diceInnerG.appendChild(diceHintText);

    // hit area (marad a diceG-n, hogy a katt a helyén maradjon)
    const hit = document.createElementNS(svg.namespaceURI,"rect");
    hit.setAttribute("x","-1.20");
    hit.setAttribute("y","-1.05");
    hit.setAttribute("width","2.40");
    hit.setAttribute("height","3.20");
    hit.setAttribute("rx","0.45");
    hit.setAttribute("fill","transparent");
    hit.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      if (state?.status === "lobby" && room.meId === state.hostId && (state.players?.length||0) >= 2){
        startGameFlow();
        return;
      }
      if (canRoll()) actRoll();
    });
    diceG.appendChild(hit);
  }

  function clearBoardPieces(){
    if (gPieces) gPieces.innerHTML = "";
    if (gTargets) gTargets.innerHTML = "";
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
      const g = document.createElementNS(svg.namespaceURI,'g');
      g.setAttribute('class','pawn');
      g.dataset.pieceId = piece.id;

      const inner = document.createElementNS(svg.namespaceURI,'g');
      inner.setAttribute('class','pawnInner');
      g.appendChild(inner);

      // Külön vizuális group: a pozíció (translate) az outer g-n van,
      // a stack-scale a pawnInner-en, a hop animáció pedig a pawnVisual-on.
      // Így a hop nem írja felül a pozíció transformot és nincs 0,0 teleport.
      const visual = document.createElementNS(svg.namespaceURI,'g');
      visual.setAttribute('class','pawnVisual');
      inner.appendChild(visual);

      const ring = document.createElementNS(svg.namespaceURI,"circle");
      ring.setAttribute("class","ring");
      ring.setAttribute("r","0.48");
      ring.setAttribute("stroke", "rgba(0,0,0,.35)");
      ring.setAttribute("stroke-width","0.08");
      ring.setAttribute("fill","rgba(255,255,255,.22)");

      const base = document.createElementNS(svg.namespaceURI,"ellipse");
      base.setAttribute("cx","0");
      base.setAttribute("cy","0.30");
      base.setAttribute("rx","0.34");
      base.setAttribute("ry","0.16");
      base.setAttribute("fill", "rgba(0,0,0,.25)");

      const body = document.createElementNS(svg.namespaceURI,"path");
      body.setAttribute("d","M -0.22 0.28 C -0.35 0.10 -0.26 -0.25 0 -0.28 C 0.26 -0.25 0.35 0.10 0.22 0.28 C 0.18 0.36 0.10 0.42 0 0.42 C -0.10 0.42 -0.18 0.36 -0.22 0.28 Z");
      body.setAttribute("fill", colorHex(piece.playerId));
      body.setAttribute("stroke","rgba(0,0,0,.35)");
      body.setAttribute("stroke-width","0.06");

      const head = document.createElementNS(svg.namespaceURI,"circle");
      head.setAttribute("cx","0");
      head.setAttribute("cy","-0.38");
      head.setAttribute("r","0.18");
      head.setAttribute("fill", colorHex(piece.playerId));
      head.setAttribute("stroke","rgba(0,0,0,.35)");
      head.setAttribute("stroke-width","0.06");

      const shine = document.createElementNS(svg.namespaceURI,"circle");
      shine.setAttribute("r","0.10");
      shine.setAttribute("fill","rgba(255,255,255,.35)");
      shine.setAttribute("cx","-0.08");
      shine.setAttribute("cy","-0.50");

      visual.appendChild(ring);
      visual.appendChild(base);
      visual.appendChild(body);
      visual.appendChild(head);
      visual.appendChild(shine);

      const hit = document.createElementNS(svg.namespaceURI,"circle");
      hit.setAttribute("class","hit");
      hit.setAttribute("r","0.70");
      hit.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        const id = g.dataset.pieceId;
        if (canPick(id)) actPick(id);
      });
      g.appendChild(hit);

      gPieces.appendChild(g);
      pawnEls.set(piece.id, g);
    }
  }

  function ensureLabelEls(){
    if (!gLabels) return;
    if (labelEls.size) return;

    for (const c of COLORS){
      const g = document.createElementNS(svg.namespaceURI,'g');
      g.setAttribute('class','pLabel');

      const bg = document.createElementNS(svg.namespaceURI,'rect');
      bg.setAttribute('x','-2.15');
      bg.setAttribute('y','-0.38');
      bg.setAttribute('width','4.30');
      bg.setAttribute('height','0.76');
      bg.setAttribute('rx','0.20');
      bg.setAttribute('fill', withAlpha(colorHex(c.id), 0.92));
      bg.setAttribute('stroke','rgba(0,0,0,.25)');
      bg.setAttribute('stroke-width','0.06');
      g.appendChild(bg);

      const txt = document.createElementNS(svg.namespaceURI,'text');
      txt.setAttribute('x','0');
      txt.setAttribute('y','0.18');
      txt.setAttribute('text-anchor','middle');
      txt.setAttribute('class','pLabelText');
      txt.textContent = c.label;
      g.appendChild(txt);

      gLabels.appendChild(g);
      labelEls.set(c.id, { g, bg, txt });
    }
  }

  function renderLabels(){
    if (!state || !gLabels) return;
    ensureLabelEls();

    const anchors = {
      green: { x:3.0, y:0.85 },
      yellow:{ x:12.0, y:0.85 },
      red:   { x:12.0, y:14.15 },
      blue:  { x:3.0, y:14.15 },
    };

    for (const c of COLORS){
      const el = labelEls.get(c.id);
      if (!el) continue;

      const pl = (state.players||[]).find(p => p.colorId === c.id);
      const name = pl ? pl.name : c.label;
      el.txt.textContent = name;

      const a = anchors[c.id] || { x:7.5, y:0.85 };
      const p = mapPos({ x:a.x, y:a.y });
      el.g.setAttribute('transform', `translate(${p.x}, ${p.y})`);
    }
  }

  function renderPieces(){
    if (!state) return;

    // csoportosítás: ugyanazon mezőn állók kapjanak offsetet (track + célvonal + finish)
    const groups = new Map();
    const keyOf = (piece) => {
      if (piece.state === 'track') return `t:${piece.trackIndex}`;
      if (piece.state === 'homeStretch') return `hs:${piece.playerId}:${piece.stretchIndex}`;
      if (piece.state === 'finished') return `fin:${piece.playerId}`;
      return null;
    };

    for (const piece of state.pieces){
      const k = keyOf(piece);
      if (!k) continue;
      const arr = groups.get(k) || [];
      arr.push(piece.id);
      groups.set(k, arr);
    }

    for (const piece of state.pieces){
      const g = pawnEls.get(piece.id);
      if (!g) continue;

      let pos = pieceToPos(state, piece);
      let scale = 1;

      const k = keyOf(piece);
      const arr = k ? (groups.get(k) || []) : [];
      if (arr.length > 1){
        scale = 0.82;
        const idx = arr.indexOf(piece.id);
        const n = arr.length;
        const ang = (idx / n) * Math.PI * 2;
        const r = (piece.state === 'track') ? 0.22 : 0.18;
        pos = { x: pos.x + Math.cos(ang)*r, y: pos.y + Math.sin(ang)*r };
      }

      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

      const inner = g.querySelector('.pawnInner');
      if (inner){
        inner.setAttribute('transform', scale === 1 ? '' : `scale(${scale})`);
      }

      const movable = (state.status === 'playing' && state.phase === 'needPick' && !uiDiceRolling && isMyTurn() && (state.movablePieceIds||[]).includes(piece.id));
      g.classList.toggle('movable', movable);
      g.style.opacity = piece.state === 'finished' ? '0.85' : '1';
    }
  }

  function renderTargets(){
    if (!gTargets) return;
    gTargets.innerHTML = "";

    if (!state || state.status !== "playing") return;
    if (!isMyTurn()) return;
    if (state.phase !== "needPick") return;
    if (uiDiceRolling) return;


    const cp = currentPlayer(state);
    const die = state.die;

    for (const pid of (state.movablePieceIds || [])){
      const piece = state.pieces.find(p => p.id === pid);
      if (!piece) continue;

      const mv = computeLegalMove(state, piece, die);
      if (!mv) continue;

      // cél pozíció
      const ghost = deepClone(piece);
      ghost.state = mv.state;
      ghost.trackIndex = mv.trackIndex ?? null;
      ghost.stretchIndex = mv.stretchIndex ?? null;

      const pos = pieceToPos(state, ghost);

      const tg = document.createElementNS(svg.namespaceURI,"g");
      tg.setAttribute("class","target");
      tg.setAttribute("transform", `translate(${pos.x}, ${pos.y})`);

      const ring = document.createElementNS(svg.namespaceURI,"circle");
      ring.setAttribute("class","t-ring");
      ring.setAttribute("r","0.42");
      ring.setAttribute("stroke", withAlpha(colorHex(cp.colorId), 0.95));
      tg.appendChild(ring);

      const dot = document.createElementNS(svg.namespaceURI,"circle");
      dot.setAttribute("class","t-dot");
      dot.setAttribute("r","0.07");
      dot.setAttribute("fill", "rgba(255,255,255,.55)");
      tg.appendChild(dot);

      gTargets.appendChild(tg);
    }
  }

  function renderDiceOverlay(){
    if (!diceG || !diceRect) return;

    if (diceG){
      diceG.classList.toggle('dicePulse', !!state && state.status === 'playing' && state.phase === 'needRoll');
    }

    if (!state || state.status === "lobby"){
      setDiceFace("—");
      dicePlayerText.textContent = state?.status === "lobby" ? "Lobby (host start)" : "—";
      diceHintText.textContent = state?.status === "lobby" ? "Katt: Start (host)" : "";
      diceRect.style.stroke = "rgba(255,255,255,.35)";
      return;
    }

    const cp = currentPlayer(state);
    const c = cp ? colorHex(cp.colorId) : "rgba(255,255,255,.35)";
    diceRect.style.stroke = withAlpha(c, 0.95);

    // face: rolling közben ne írjuk felül a flickert
    if (!uiDiceRolling){
      if (state.die){
        setDiceFace(state.die);
      } else if (state.lastRoll && (Date.now() - state.lastRoll.at) < 20000){
        setDiceFace(state.lastRoll.die);
      } else {
        setDiceFace("—");
      }
    }

    dicePlayerText.textContent = cp ? `${cp.name} jön` : "—";
    if (canRoll()){
      diceHintText.textContent = "Katt: DOBÁS";
    } else if (isMyTurn() && state.phase === "needPick"){
      diceHintText.textContent = "Válassz bábut";
    } else {
      diceHintText.textContent = "Várj…";
    }
  }

  // =======================
  // ANIMATION (hop step-by-step)
  // =======================
  async function animateMove(anim){
    const g = pawnEls.get(anim.pieceId);
    if (!g) return;
    const visual = g.querySelector('.pawnVisual') || g;

    for (let i=0;i<anim.steps.length;i++){
      const p = anim.steps[i];
      g.setAttribute("transform", `translate(${p.x}, ${p.y})`);
      // hop (csak a vizuális group-on, különben SVG transform felülírja a pozíciót és 0,0-ra teleportál)
      visual.classList.remove('hop');
      try{ void visual.getBBox(); }catch{}
      visual.classList.add('hop');
      await delay(i === 0 ? MOVE_STEP_MS_FIRST : MOVE_STEP_MS);
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
  

    // +1s szünet a lépés után (követhetőbb körváltás + körszín megtartása)
    await delay(POST_MOVE_PAUSE_MS);
  }

  // =======================
  // MODALS
  // =======================
  function openRules(){
    if (!rulesModal) return;
    rulesModal.classList.add('show');
    rulesModal.setAttribute('aria-hidden','false');
  }
  function closeRules(){
    if (!rulesModal) return;
    rulesModal.classList.remove('show');
    rulesModal.setAttribute('aria-hidden','true');
  }

  function openWin(name){
    const safe = escapeHtml(name);
    winText.innerHTML = `<div class="winBig">NYERT: <span class="winName">${safe}</span></div>`;
    winModal.classList.add('show');
    winModal.setAttribute('aria-hidden','false');
  }
  function closeWin(){
    winModal.classList.remove("show");
    winModal.setAttribute("aria-hidden","true");
  }

  // =======================
  // RENDER ALL
  // =======================
  function renderAll(){
    buildBoardIfNeeded();
    updateViewAngle();
    // Derived from timestamp lock so roll previews never leak even if a realtime event arrives late
    uiDiceRolling = (uiRollLockUntil && Date.now() < uiRollLockUntil) ? true : false;
    renderLabels();
    refreshMobileRoomOverlay();
    renderTurn();
    renderScore();
    renderLogFromState();

    ensurePawnEls();
    renderPieces();
    renderTargets();
    renderDiceOverlay();

    refreshControls();
  }

  // =======================
  // WIRES
  // =======================
  elBtnRoll.addEventListener("click", actRoll);
  elBtnSkip.addEventListener("click", async () => {
    if (!state || state.status !== "playing" || !isMyTurn()) return;
    const s2 = nextTurnInState(state, false);
    s2.log.unshift(`${currentPlayer(state).name} passzolt.`);
    await pushState(s2, null);
  });

  elBtnStartMain.addEventListener("click", () => startGameFlow().catch(()=>setHint("Start hiba.")));
  btnStart.addEventListener("click", () => startGameFlow().catch(()=>setHint("Start hiba.")));

  btnJoin.addEventListener("click", () => joinRoomFlow().catch(()=>setHint("Join hiba.")));
  btnCreate.addEventListener("click", () => createRoomFlow().catch(()=>setHint("Create hiba.")));

  btnLeave.addEventListener("click", () => leaveRoomFlow());

  function copyCode(){
    if (!room.code) return;
    navigator.clipboard?.writeText(room.code);
    setHint("Kód másolva.");
  }
  btnCopy.addEventListener("click", copyCode);
  btnCopyBig.addEventListener("click", copyCode);

  if (btnRules) btnRules.addEventListener("click", openRules);
  if (btnCloseRules) btnCloseRules.addEventListener("click", closeRules);
  if (rulesModal) rulesModal.addEventListener("pointerdown", (e) => { if (e.target === rulesModal) closeRules(); });

  btnCloseWin.addEventListener("click", closeWin);
  btnBackLobby.addEventListener("click", () => { closeWin(); openLobby(); });

  window.addEventListener("resize", () => {
    refreshMobileRoomOverlay();
    updateViewAngle();
    renderLabels();
    renderPieces();
    renderTargets();
  });

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
    setNet("ready", "var(--yellow)");
  } else {
    setNet("no-supabase", "var(--red)");
  }
})();
