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
  const PATH_SET = new Set(PATH.map(p => cellKey(p[0],p[1])));

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

  // Entry = a start előtti mező a tracken (innen lépsz be a homeStretch[0]-ra)
  const HOME_ENTRY_INDEX = Object.fromEntries(
    Object.keys(START_INDEX).map(id => [id, (START_INDEX[id] + PATH.length - 1) % PATH.length])
  );

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
  const elMobileRoomCode = $("#mobileRoomCode");

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

  // SVG
  let svg = null;
  let gPieces = null;
  let gTargets = null;
  let diceG = null;
  let diceRect = null;
  let diceFaceText = null;
  let dicePlayerText = null;
  let diceHintText = null;
  const pawnEls = new Map();

  let gWorld = null;

  // view rotation (board rotates per player; pawns + dice counter-rotate)
  let viewRot = 0;

  // roll animation sync
  let rollAnimUntil = 0;
  let lastRollStartAt = 0;
  const ROLL_ANIM_MS = 1000;

  // movement speed
  const MOVE_STEP_MS = 160;
  const MOVE_FIRST_STEP_MS = 80;


  // =======================
  // NETWORK
  // =======================
  async function requireSupabase(){
    if (!sb){
      setHint("Supabase nincs beállítva (URL + Publishable key).");
      setNet("no-supabase", "var(--red)");
      throw new Error("Supabase not configured");
    }
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
      setNet(status, status === "SUBSCRIBED" ? "var(--green)" : "var(--muted)");
    });

    room.channel = ch;
  }

  async function broadcast(event, payload){
    if (!room.channel) return;
    await room.channel.send({ type:"broadcast", event, payload });
  }

  function startPolling(){
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (!room.code) return;
      if (animLock) return;
      try{
        const rr = await fetchRoom(room.code);
        if (rr && rr.version > version) onRemoteSnapshot(rr.state, rr.version);
      }catch{}
    }, 1100);
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
    // csak vizuális anim + hint, a state úgyis jön snapshotból is
    if (payload?.die){
      const startAt = payload.startAt ?? Date.now();
      const dur = payload.duration ?? 1000;
      rollAnimUntil = Math.max(rollAnimUntil, startAt + dur);
      diceRollAnim(payload.die, startAt, dur);
    }
    if (payload?.byName && payload?.die){
      toast(`${payload.byName} dobott: ${payload.die}`);
    }
  }

  async function pushState(newState, extras){
    try{
      const upd = await updateRoomState(newState, version);
      applySnapshot(upd.state, upd.version);

      if (extras?.moveAnim){
        await broadcast("move", {
          toVersion: upd.version,
          anim: extras.moveAnim,
          state: upd.state
        });
      }
      if (extras?.rollAnim){
        await broadcast("roll", {
          toVersion: upd.version,
          die: extras.rollAnim.die,
          byName: extras.rollAnim.byName,
          colorId: extras.rollAnim.colorId,
          startAt: extras.rollAnim.startAt,
          duration: extras.rollAnim.duration
        });
      }
    } catch (e){
      try{
        const rr = await fetchRoom(room.code);
        if (rr) applySnapshot(rr.state, rr.version);
      } catch {}
      toast("Ütközés / desync: frissítettem a szobát.");
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
    const occ = getTrackOccupancy(s);
    const key = cellKey(coord[0], coord[1]);
    const bucket = occ.get(key);
    if (!bucket) return true;

    // 2 azonos bábu blokkol
    for (const [pid, cnt] of bucket.countByPlayer.entries()){
      if (pid !== colorId && cnt >= 2) return false;
    }
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

    // homeStretch (bounce szabály)
    if (piece.state === "homeStretch"){
      const cur = piece.stretchIndex;
      const target = cur + die;
      if (target === 6) return { state:"finished", trackIndex:null, stretchIndex:null };
      if (target < 6) return { state:"homeStretch", trackIndex:null, stretchIndex:target };
      // túldobás: elmegy 6-ig, majd vissza
      const extra = target - 6;
      const back = 6 - extra;
      if (back === 6) return { state:"finished", trackIndex:null, stretchIndex:null };
      return { state:"homeStretch", trackIndex:null, stretchIndex:Math.max(0, back) };
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
      return { x: c.finishSpot[0], y: c.finishSpot[1] };
    }
    return { x:7.5, y:7.5 };
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
      const coord = PATH[piece.trackIndex];
      const key = cellKey(coord[0], coord[1]);

      // safe start mezők (mindenkinek safe)
      const safeStart = SAFE_START_CELLS.has(key);

      if (!safeStart){
        const victims = s.pieces.filter(pp =>
          pp.id !== piece.id &&
          pp.state === "track" &&
          pp.trackIndex === piece.trackIndex &&
          pp.playerId !== piece.playerId
        );

        if (victims.length){
          // FIX: saját színű mezőn álló bábu nem üthető
          const survivors = [];
          const knocked = [];

          for (const v of victims){
            const protectedByOwnColor = isProtectedTrackForColor(v.playerId, v.trackIndex);
            if (protectedByOwnColor){
              survivors.push(v);
            }else{
              knocked.push(v);
            }
          }

          for (const v of knocked){
            v.state = "home";
            v.trackIndex = null;
            v.stretchIndex = null;
          }

          if (knocked.length){
            s.log.unshift(`${actor.name} ütött: ${knocked.length} bábu haza.`);
          } else if (survivors.length){
            s.log.unshift(`${actor.name} próbált ütni, de védett mező (saját szín).`);
          }
        }
      }
    }

    // finish
    if (piece.state === "finished"){
      const pl = s.players.find(p => p.id === actor.id);
      pl.finished = (pl.finished || 0) + 1;
      s.log.unshift(`${actor.name} beért! (${pl.finished}/4)`);
    }

    if (s.log.length > 80) s.log.length = 80;
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
    const cp = currentPlayer(state);
    return !!cp && cp.id === room.meId;
  }
  function canRoll(){
    return state && state.status === "playing" && state.phase === "needRoll" && isMyTurn();
  }
  function canPick(pieceId){
    return state && state.status === "playing" && state.phase === "needPick" && isMyTurn() && (Date.now() >= rollAnimUntil) && (state.movablePieceIds||[]).includes(pieceId);
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

  async function diceRollAnim(finalDie, startAt=Date.now(), duration=1000){
    if (!diceG) return;
    const wait = startAt - Date.now();
    if (wait > 0) await delay(wait);

    diceG.classList.add("diceRolling");
    const t0 = Date.now();
    // gyors pörgetés a teljes idő alatt
    while (Date.now() - t0 < Math.max(0, duration - 120)){
      setDiceFace(((Math.floor((Date.now()-t0)/40) % 6) + 1));
      await delay(40);
    }
    setDiceFace(finalDie);
    await delay(80);
    diceG.classList.remove("diceRolling");
  }

  // =======================
  // ACTIONS
  // =======================
  async function actRoll(){
    if (!canRoll()) return;

    const die = rollDie();
    const startAt = Date.now() + 250; // kis ráhagyás a szinkronhoz
    const duration = 1000;

    rollAnimUntil = Math.max(rollAnimUntil, startAt + duration);
    // local vizu anim szinkronban
    diceRollAnim(die, startAt, duration);

    const s = deepClone(state);
    const cp = currentPlayer(s);

    s.die = die;
    s.phase = "needPick";
    s.updatedAt = nowIso();

    // FIX: lastRoll megmarad
    s.lastRoll = { byId: cp.id, byName: cp.name, colorId: cp.colorId, die, at: Date.now() };

    s.log.unshift(`${cp.name} dobott: ${die}.`);
    s.movablePieceIds = updateMovablePieceIds(s);

    if (s.movablePieceIds.length === 0){
      s.log.unshift(`${cp.name}: nincs lépés.`);
      const s2 = nextTurnInState(s, false);
      await pushState(s2, { rollAnim:{ die, byName: cp.name, colorId: cp.colorId, startAt, duration } });
      return;
    }

    await pushState(s, { rollAnim:{ die, byName: cp.name, colorId: cp.colorId, startAt, duration } });

    // auto-move (várja meg a dobás anim végét)
    if (s.settings.autoMove && s.movablePieceIds.length === 1){
      const wait = (startAt + duration + 40) - Date.now();
      if (wait > 0) await delay(wait);
      if (state && state.phase === "needPick" && isMyTurn() && state.movablePieceIds.length === 1){
        await actPick(state.movablePieceIds[0]);
      }
    }
  }

  function computeViewRotation(){
    const id = room.myColor;
    if (id === "blue") return 0;
    if (id === "red") return 90;
    if (id === "yellow") return 180;
    if (id === "green") return 270;
    return 0;
  }

  function applyViewRotation(){
    viewRot = computeViewRotation();
    if (gWorld){
      gWorld.setAttribute("transform", `rotate(${viewRot} 7.5 7.5)`);
    }
    // dice counter-rotate
    if (diceG){
      diceG.setAttribute("transform", `translate(7.5 7.05)`);
    }
  }

  function pawnTransform(x,y, scale=1, dx=0, dy=0){
    return `translate(${(x+dx).toFixed(3)}, ${(y+dy).toFixed(3)}) rotate(${-viewRot}) scale(${scale})`;
  }

  async function pushStateWithTurnDelay(finalStateAfterTurnComputed, moveAnim, extraTurn){
    // Itt a finalStateAfterTurnComputed már nextTurnInState()-ből jön (phase: needRoll),
    // de a turnIndex csak akkor legyen érvényes, ha NEM extra kör.
    // Megoldás: két lépcsőben pusholunk: (1) állapot a lépés után, még ugyanazzal a turnIdx-vel
    // (2) anim +1s után váltunk (ha kell).

    // 1) lépés utáni 'postMove' state: visszavesszük a turn váltást ha nem extra, és csak később alkalmazzuk
    const postMove = deepClone(state);
    // postMove legyen a lépés utáni állapot (a hívó már kiszámolta s2-t, de az már turnváltott)
    // ezért a hívó s2-t átadjuk, és készítünk egy copy-t, amin visszaállítjuk a turn váltást ideiglenesen
    const intended = deepClone(finalStateAfterTurnComputed);

    // intended-ben már s.phase=needRoll, die=null, stb. A turnIdx viszont extra kör esetén ugyanaz,
    // nem extra esetén következő. Mi azt akarjuk, hogy a snapshot a lépés alatt még a régi turnIdx maradjon.
    const before = deepClone(state);
    postMove.status = intended.status;
    postMove.settings = intended.settings;
    postMove.players = intended.players;
    postMove.pieces = intended.pieces;
    postMove.log = intended.log;
    postMove.winnerId = intended.winnerId;

    // ideiglenesen: maradjon a mostani kör
    postMove.turnIdx = before.turnIdx;
    postMove.phase = 'animating';
    postMove.die = before.die;
    postMove.movablePieceIds = [];
    postMove.updatedAt = nowIso();

    await pushState(postMove, { moveAnim });

    // ha nyertünk, nem váltunk tovább
    if (intended.status === 'ended') return;

    // 2) anim +1s után: alkalmazzuk az intended-et
    const steps = (moveAnim?.steps?.length || 1);
    const animMs = steps * MOVE_STEP_MS + 80;
    await delay(animMs + 1000);

    // frissítsük az aktuális state-et a DB-ből, hogy ne csússzunk verziót
    const rr = await fetchRoom(room.code).catch(()=>null);
    if (rr){ applySnapshot(rr.state, rr.version); }

    // csak az a kliens váltson, aki lépett (és még mindig ugyanabban a körben vagyunk)
    if (!state || state.status !== 'playing') return;
    const cpNow = currentPlayer(state);
    // ha valahogy már váltott, ne duplázzunk
    if (state.phase !== 'animating') return;

    // most alkalmazzuk az intended-et, de fixen: die null, phase needRoll
    const commit = deepClone(intended);
    commit.phase = 'needRoll';
    commit.die = null;
    commit.movablePieceIds = [];
    commit.updatedAt = nowIso();

    await pushState(commit, null);
  }

  function buildMoveAnim(prev, piece, mv){
    const steps = [];
    const captures = [];

    const cxy = (coord) => ({ x: coord[0] + 0.5, y: coord[1] + 0.5 });
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
      // végállomás: ha finished akkor 6, különben stretchIndex
      const dieSteps = prev.die;
      const target = start + dieSteps;

      // előre lépések (6-ig)
      const forwardEnd = Math.min(6, target);
      for (let i=start+1;i<=forwardEnd;i++){
        if (i === 6){
          steps.push({ x:c.finishSpot[0], y:c.finishSpot[1] });
        } else {
          steps.push({ x:c.homeStretch[i][0]+0.5, y:c.homeStretch[i][1]+0.5 });
        }
      }

      // bounce vissza, ha túldobás
      if (target > 6){
        const extra = target - 6;
        for (let j=1;j<=extra;j++){
          const i = 6 - j;
          steps.push({ x:c.homeStretch[i][0]+0.5, y:c.homeStretch[i][1]+0.5 });
        }
      }
    }

    // capture check (landing on track)
    if ((piece.state === "home" && mv.state === "track") || (piece.state === "track" && mv.state === "track")){
      const landing = mv.trackIndex;
      const coord = PATH[landing];
      const key = cellKey(coord[0], coord[1]);

      if (!SAFE_START_CELLS.has(key)){
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
    }

    return { pieceId: piece.id, steps, captures };
  }

  async function actPick(pieceId){
    if (!canPick(pieceId)) return;

    const piece = state.pieces.find(p => p.id === pieceId);
    if (!piece) return;

    const mv = computeLegalMove(state, piece, state.die);
    if (!mv) return;

    // anim lépésről-lépésre
    const anim = buildMoveAnim(state, piece, mv);

    // állapot: lépés alkalmazása
    let s2 = applyMoveToState(state, pieceId, mv);

    const cpAfter = currentPlayer(s2);
    const plAfter = s2.players.find(p => p.id === cpAfter.id);

    // win?
    if (plAfter && (plAfter.finished || 0) >= 4){
      s2.status = "ended";
      s2.phase = "ended";
      s2.winnerId = cpAfter.id;
      s2.log.unshift(`${cpAfter.name} nyert!`);
      s2.updatedAt = nowIso();
      await pushState(s2, { moveAnim: anim });
      return;
    }

    // extra turn rules (NEM stackelődik):
    // - 6-os dobásnál mindig extra
    // - ha beért egy bábu -> extra
    const finishedThisMove = (mv.state === "finished");
    const extraBySix = (s2.settings.extraTurnOnSix && state.die === 6);
    const extra = extraBySix || finishedThisMove;

    if (finishedThisMove){
      s2.log.unshift(`${cpAfter.name}: beérés -> még egy dobás.`);
    } else if (extraBySix){
      s2.log.unshift(`${cpAfter.name} 6-os! Még egy dobás.`);
    }

    // turn váltás kiszámolása, DE a commit csak anim +1s után
    const intended = nextTurnInState(s2, extra);

    // anim végéig marad a kör színe, utána +1s, aztán vált
    await pushStateWithTurnDelay(intended, anim, extra);
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

    roomBar.hidden = false;
    roomCodeText.textContent = room.code;
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

    elBoard.innerHTML = "";
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox","0 0 15 15");
    svg.setAttribute("preserveAspectRatio","xMidYMid meet");

    // world layer: this is what rotates per player
    gWorld = document.createElementNS(svg.namespaceURI,"g");
    gWorld.setAttribute("class","world");
    svg.appendChild(gWorld);

    // cells
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
        gWorld.appendChild(rect);

        // start dots
        if (SAFE_START_CELLS.has(cellKey(x,y))){
          const dot = document.createElementNS(svg.namespaceURI,"circle");
          dot.setAttribute("cx", x+0.5);
          dot.setAttribute("cy", y+0.5);
          dot.setAttribute("r", 0.10);
          dot.setAttribute("fill", "rgba(255,255,255,.70)");
          gWorld.appendChild(dot);
        }
      }
    }

    // center decoration
    const tris = [
      { pts: "6,6 7.5,7.5 6,9", fill: withAlpha(getCSS("--green"), 0.30) },
      { pts: "6,6 7.5,7.5 9,6", fill: withAlpha(getCSS("--yellow"), 0.30) },
      { pts: "9,9 7.5,7.5 9,6", fill: withAlpha(getCSS("--red"), 0.30) },
      { pts: "6,9 7.5,7.5 9,9", fill: withAlpha(getCSS("--blue"), 0.30) },
    ];
    for (const t of tris){
      const poly = document.createElementNS(svg.namespaceURI,"polygon");
      poly.setAttribute("points", t.pts);
      poly.setAttribute("fill", t.fill);
      poly.setAttribute("class","center");
      gWorld.appendChild(poly);
    }

    // targets layer
    gTargets = document.createElementNS(svg.namespaceURI,"g");
    gWorld.appendChild(gTargets);

    // pieces layer
    gPieces = document.createElementNS(svg.namespaceURI,"g");
    gWorld.appendChild(gPieces);

    // center dice (on top)
    buildCenterDice();

    elBoard.appendChild(svg);

    applyViewRotation();
  }

  function getCellInfo(x,y){
    const bg = "#22283a";
    const pathBg = "#2a334a";
    const centerBg = "#273049";

    const inGreenHome = (x<=5 && y<=5);
    const inYellowHome = (x>=9 && y<=5);
    const inBlueHome = (x<=5 && y>=9);
    const inRedHome = (x>=9 && y>=9);
    const inCenter = (x>=6 && x<=8 && y>=6 && y<=8);

    const k = cellKey(x,y);
    const isPath = PATH_SET.has(k);
    const hs = HOME_STRETCH_MAP.get(k);

    if (inCenter) return { fill:centerBg, cls:"center" };
    if (inGreenHome) return { fill: withAlpha(getCSS("--green"), 0.16), cls:"" };
    if (inYellowHome) return { fill: withAlpha(getCSS("--yellow"), 0.16), cls:"" };
    if (inRedHome) return { fill: withAlpha(getCSS("--red"), 0.16), cls:"" };
    if (inBlueHome) return { fill: withAlpha(getCSS("--blue"), 0.16), cls:"" };

    if (hs) return { fill: withAlpha(colorHex(hs.id), 0.30), cls:"path" };

    if (isPath){
      // saját színű track szegmens színezése (játékosabb + védett mező)
      const idx = PATH.findIndex(p => p[0]===x && p[1]===y);
      for (const c of COLORS){
        if (COLORED_TRACK.get(c.id)?.has(idx)){
          return { fill: withAlpha(colorHex(c.id), 0.24), cls:"path" };
        }
      }
      return { fill: pathBg, cls:"path" };
    }

    return { fill:bg, cls:"" };
  }

  function buildCenterDice(){
    diceG = document.createElementNS(svg.namespaceURI,"g");
    diceG.setAttribute("class","diceRoot");
    // közép környéke, kicsit feljebb, hogy a szöveg alatt elférjen
    // transform is set by applyViewRotation()
    svg.appendChild(diceG);

    diceRect = document.createElementNS(svg.namespaceURI,"rect");
    diceRect.setAttribute("x","-1.05");
    diceRect.setAttribute("y","-0.95");
    diceRect.setAttribute("width","2.10");
    diceRect.setAttribute("height","1.90");
    diceRect.setAttribute("rx","0.35");
    diceRect.setAttribute("class","diceBox");
    diceRect.setAttribute("stroke","rgba(255,255,255,.35)");
    diceG.appendChild(diceRect);

    diceFaceText = document.createElementNS(svg.namespaceURI,"text");
    diceFaceText.setAttribute("x","0");
    diceFaceText.setAttribute("y","0.20");
    diceFaceText.setAttribute("text-anchor","middle");
    diceFaceText.setAttribute("class","diceFaceText");
    diceFaceText.textContent = "—";
    diceG.appendChild(diceFaceText);

    dicePlayerText = document.createElementNS(svg.namespaceURI,"text");
    dicePlayerText.setAttribute("x","0");
    dicePlayerText.setAttribute("y","1.55");
    dicePlayerText.setAttribute("text-anchor","middle");
    dicePlayerText.setAttribute("class","diceSubText");
    dicePlayerText.textContent = "—";
    diceG.appendChild(dicePlayerText);

    diceHintText = document.createElementNS(svg.namespaceURI,"text");
    diceHintText.setAttribute("x","0");
    diceHintText.setAttribute("y","1.95");
    diceHintText.setAttribute("text-anchor","middle");
    diceHintText.setAttribute("class","diceHintText");
    diceHintText.textContent = "";
    diceG.appendChild(diceHintText);

    // hit area
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
      const g = document.createElementNS(svg.namespaceURI,"g");
      g.setAttribute("class","pawn");
      g.dataset.pieceId = piece.id;

      const ring = document.createElementNS(svg.namespaceURI,"circle");
      ring.setAttribute("class","ring");
      ring.setAttribute("r","0.40");
      ring.setAttribute("stroke", withAlpha(colorHex(piece.playerId), 0.95));

      const body = document.createElementNS(svg.namespaceURI,"circle");
      body.setAttribute("r","0.28");
      body.setAttribute("fill", colorHex(piece.playerId));
      body.setAttribute("stroke","rgba(255,255,255,.30)");
      body.setAttribute("stroke-width","0.08");

      const shine = document.createElementNS(svg.namespaceURI,"circle");
      shine.setAttribute("r","0.11");
      shine.setAttribute("fill","rgba(255,255,255,.20)");
      shine.setAttribute("cx","-0.08");
      shine.setAttribute("cy","-0.08");

      const hit = document.createElementNS(svg.namespaceURI,"circle");
      hit.setAttribute("class","hit");
      hit.setAttribute("r","0.60");
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


  function renderPieces(){
    if (!state) return;

    // stack groups by logical cell
    const groups = new Map();
    for (const piece of state.pieces){
      let key = "";
      if (piece.state === "home"){
        const c = COLORS.find(x => x.id === piece.playerId);
        const slot = c.homeSlots[piece.n];
        key = `H:${piece.playerId}:${slot[0]},${slot[1]}`;
      } else if (piece.state === "track"){
        key = `T:${piece.trackIndex}`;
      } else if (piece.state === "homeStretch"){
        key = `S:${piece.playerId}:${piece.stretchIndex}`;
      } else if (piece.state === "finished"){
        key = `F:${piece.playerId}`;
      } else {
        key = `X:${piece.id}`;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(piece);
    }

    for (const [key, arr] of groups){
      const n = arr.length;
      // 1: normal, 2-4: shrink + offset so all visible
      let scale = 1;
      let offsets = [{dx:0,dy:0}];
      if (n >= 2){
        scale = 0.78;
        const d = 0.22;
        offsets = [
          {dx:-d, dy:-d},
          {dx:+d, dy:-d},
          {dx:-d, dy:+d},
          {dx:+d, dy:+d},
        ];
      }

      for (let i=0;i<n;i++){
        const piece = arr[i];
        const g = pawnEls.get(piece.id);
        if (!g) continue;

        const pos = pieceToPos(state, piece);
        const off = offsets[Math.min(i, offsets.length-1)];
        g.setAttribute("transform", pawnTransform(pos.x, pos.y, scale, off.dx, off.dy));

        const movable = (state.status === "playing" && state.phase === "needPick" && isMyTurn() && (Date.now() >= rollAnimUntil) && (state.movablePieceIds||[]).includes(piece.id));
        g.classList.toggle("movable", movable);
        g.style.opacity = piece.state === "finished" ? "0.85" : "1";
      }
    }
  }

  function renderTargets(){
    if (!gTargets) return;
    gTargets.innerHTML = "";

    if (!state || state.status !== "playing") return;
    if (!isMyTurn()) return;
    if (state.phase !== "needPick") return;
    if (Date.now() < rollAnimUntil) return;

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

    if (!state || state.status === "lobby"){
      setDiceFace("—");
      dicePlayerText.textContent = state?.status === "lobby" ? "Lobby (host start)" : "—";
      diceHintText.textContent = state?.status === "lobby" ? "Katt: Start (host)" : "";
      diceRect.setAttribute("stroke", "rgba(255,255,255,.35)");
      diceG.classList.remove("dicePulse");
      return;
    }

    const cp = currentPlayer(state);
    const c = cp ? colorHex(cp.colorId) : "rgba(255,255,255,.35)";
    // körvonal = soron következő színe
    diceRect.setAttribute("stroke", withAlpha(c, 0.95));

    // pulzáljon amikor dobni kell
    diceG.classList.toggle("dicePulse", !!canRoll());

    // face: ha van aktuális die, azt mutatja, különben lastRoll
    if (state.die){
      setDiceFace(state.die);
    } else if (state.lastRoll && (Date.now() - state.lastRoll.at) < 20000){
      setDiceFace(state.lastRoll.die);
    } else {
      setDiceFace("—");
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

    // anim során nem stackelünk, csak a mozgatott bábut
    for (let i=0;i<anim.steps.length;i++){
      const p = anim.steps[i];
      g.setAttribute("transform", pawnTransform(p.x, p.y));
      // hop
      g.classList.remove("hop");
      void g.getBBox();
      g.classList.add("hop");
      await delay(i === 0 ? 80 : MOVE_STEP_MS);
    }

    if (anim.captures?.length){
      for (const vid of anim.captures){
        const vg = pawnEls.get(vid);
        if (!vg) continue;
        vg.style.transition = "opacity 140ms ease";
        vg.style.opacity = "0.15";
        await delay(140);
        vg.style.opacity = "1";
        vg.style.transition = "";
      }
    }
  }

  // =======================
  // MODALS
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
  // RENDER ALL
  // =======================
  function renderAll(){
    buildBoardIfNeeded();
    applyViewRotation();
    renderTurn();
    renderScore();
    renderLogFromState();

    ensurePawnEls();
    renderPieces();
    renderTargets();
    renderDiceOverlay();

    const mobile = (window.matchMedia && window.matchMedia("(max-width: 820px)").matches);
    document.body.classList.toggle("isMobile", mobile);

    if (elMobileRoomCode){
      const isHost = !!(mobile && room.code && state && room.meId === state.hostId);
      elMobileRoomCode.hidden = !isHost;
      if (isHost) elMobileRoomCode.textContent = `Szoba: ${room.code}`;
    }

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
    setNet("ready", "var(--yellow)");
  } else {
    setNet("no-supabase", "var(--red)");
  }
})();
