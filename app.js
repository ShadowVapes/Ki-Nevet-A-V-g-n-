(() => {
  // Ki nevet a végén – Online (2–4)
  // Single-file frontend with Supabase Realtime + DB state.
  // Notes:
  // - Designed to run on GitHub Pages.
  // - Uses a shared "rooms" table + "room_events" broadcast channel.
  // - Minimal authoritative server: clients push state (host mostly).
  //
  // Author: ChatGPT (per user spec)

  // ===============================
  // Config
  // ===============================
const SUPABASE_URL = "https://tisfsoerdufcbusslymn.supabase.co/";
const SUPABASE_ANON_KEY = "sb_publishable_U8iceA_u25OjEaWjHkeGAw_XD99-Id-";
  const TABLE_ROOMS = "rooms"; // columns: code(text pk), state(json), updated_at(ts), host_id(text)
  const TABLE_PLAYERS = "room_players"; // columns: code(text), player_id(text), name(text), color_id(text), is_host(bool), joined_at(ts)
  const TABLE_EVENTS = "room_events"; // columns: id(uuid), code(text), type(text), payload(json), created_at(ts)

  // UI
  const el = (id) => document.getElementById(id);
  const boardEl = el("board");
  const lobbyModal = el("lobbyModal");
  const rulesModal = el("rulesModal");
  const winModal = el("winModal");

  const btnRules = el("btnRules");
  const btnCloseRules = el("btnCloseRules");
  const btnLeave = el("btnLeave");

  const yourName = el("yourName");
  const roomCode = el("roomCode");
  const playerCountSel = el("playerCount");
  const optExtraTurnOnSix = el("optExtraTurnOnSix");
  const optAutoMove = el("optAutoMove");

  const btnJoin = el("btnJoin");
  const btnCreate = el("btnCreate");
  const btnStart = el("btnStart");
  const btnStartMain = el("btnStartMain");
  const btnRoll = el("btnRoll");
  const btnSkip = el("btnSkip");

  const hintEl = el("hint");
  const roomBar = el("roomBar");
  const roomCodeText = el("roomCodeText");
  const roomCodeBig = el("roomCodeBig");
  const btnCopy = el("btnCopy");
  const btnCopyBig = el("btnCopyBig");
  const playersList = el("playersList");
  const lobbyState = el("lobbyState");

  const turnName = el("turnName");
  const turnDot = el("turnDot");
  const turnMeta = el("turnMeta");
  const netState = el("netState");
  const netState2 = el("netState2");
  const scoreEl = el("score");
  const logEl = el("log");

  const winText = el("winText");
  const btnCloseWin = el("btnCloseWin");
  const btnBackLobby = el("btnBackLobby");

  // ===============================
  // Helpers
  // ===============================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => Date.now();
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mod = (n, m) => ((n % m) + m) % m;

  const deepClone = (o) => JSON.parse(JSON.stringify(o));

  function uid() {
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }

  function safeText(s) {
    return (s || "").toString().replace(/[<>]/g, "");
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
  }

  // ===============================
  // Colors + Board layout
  // ===============================
  const COLORS = [
    {
      id: "green",
      name: "Zöld",
      hex: "#37dd7a",
      start: [1, 6],
      finishSpot: [4.0, 10.9],
      homeSlots: [[1,1],[4,1],[1,4],[4,4]],
      homeStretch: [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
    },
    {
      id: "yellow",
      name: "Sárga",
      hex: "#ffd24a",
      start: [8, 1],
      finishSpot: [10.9, 4.0],
      homeSlots: [[10,1],[13,1],[10,4],[13,4]],
      homeStretch: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
    },
    {
      id: "red",
      name: "Piros",
      hex: "#ff5579",
      start: [13, 8],
      finishSpot: [11.0, 10.9],
      homeSlots: [[10,10],[13,10],[10,13],[13,13]],
      homeStretch: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
    },
    {
      id: "blue",
      name: "Kék",
      hex: "#4db1ff",
      start: [6, 13],
      finishSpot: [4.0, 11.0],
      homeSlots: [[1,10],[4,10],[1,13],[4,13]],
      homeStretch: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
    },
  ];

  const colorById = Object.fromEntries(COLORS.map((c) => [c.id, c]));
  const colorHex = (id) => (colorById[id] ? colorById[id].hex : "#ffffff");
  const colorName = (id) => (colorById[id] ? colorById[id].name : id);

  // Track path: 15x15 grid, center cross.
  // PATH is an ordered array of [x,y] for track cells.
  // Using a standard Ludo-like loop aligned to this board definition.
  const PATH = [
    [6,13],[6,12],[6,11],[6,10],[6,9],[6,8],
    [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
    [0,7],[0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,6],
    [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
    [7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,6],
    [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
    [14,7],[14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,8],
    [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
    [7,14],[6,14],
  ];

  // Track direction: -1 means reverse along PATH.
  const TRACK_DIR = -1;

  function trackStep(idx, dir) {
    return mod(idx + dir, PATH.length);
  }
  const TRACK_BACK_DIR = -TRACK_DIR;

  function stepsToIndex(cur, target) {
    return TRACK_DIR === 1 ? mod(target - cur, PATH.length) : mod(cur - target, PATH.length);
  }

  // Start index per color (where a piece enters the track)
  const START_INDEX = Object.fromEntries(
    COLORS.map((c) => [c.id, PATH.findIndex((p) => p[0] === c.start[0] && p[1] === c.start[1])])
  );

  // Home entry index computed from homeStretch direction:
  // entry = 2*hs0 - hs1, then find in PATH
  const HOME_ENTRY_INDEX = Object.fromEntries(
    COLORS.map((c) => {
      const [x0, y0] = c.homeStretch[0];
      const [x1, y1] = c.homeStretch[1];
      const entry = [x0 - (x1 - x0), y0 - (y1 - y0)];
      const idx = PATH.findIndex((p) => p[0] === entry[0] && p[1] === entry[1]);
      return [c.id, idx];
    })
  );

  // Protected segments: 6 cells after start (along TRACK_DIR) + start itself.
  function isProtectedTrackForColor(colorId, trackIndex) {
    const start = START_INDEX[colorId];
    if (trackIndex === start) return true;
    for (let i = 1; i <= 6; i++) {
      const ti = trackStep(start, TRACK_DIR * i);
      if (trackIndex === ti) return true;
    }
    return false;
  }

  // ===============================
  // Game state schema
  // ===============================
  // state: {
  //   status: "lobby"|"playing"|"ended",
  //   code, hostId,
  //   players: [{id,name,colorId,finished}],
  //   turnIdx,
  //   phase: "awaitRoll"|"needPick"|"animating",
  //   die,
  //   rollStartAt, rollUntil, // animation lock
  //   pieces: [{id,playerId,idx,state,trackIndex,stretchIndex}],
  //   movablePieceIds: [],
  //   log: [],
  //   settings: { extraTurnOnSix, autoMove },
  //   updatedAt
  // }

  function makeInitialState(code, hostId, playerCount, settings) {
    const order = ["green", "yellow", "red", "blue"].slice(0, playerCount);
    const players = order.map((cid, i) => ({
      id: i === 0 ? hostId : uid(),
      name: i === 0 ? safeText(yourName.value || "Host") : `P${i + 1}`,
      colorId: cid,
      finished: 0,
    }));

    const pieces = [];
    for (const pl of players) {
      for (let i = 0; i < 4; i++) {
        pieces.push({
          id: uid(),
          playerId: pl.colorId,
          idx: i,
          state: "home",
          trackIndex: null,
          stretchIndex: null,
        });
      }
    }

    return {
      status: "lobby",
      code,
      hostId,
      players,
      turnIdx: 0,
      phase: "awaitRoll",
      die: null,
      rollStartAt: null,
      rollUntil: null,
      pieces,
      movablePieceIds: [],
      log: [],
      settings: {
        extraTurnOnSix: !!settings.extraTurnOnSix,
        autoMove: !!settings.autoMove,
      },
      winnerId: null,
      updatedAt: now(),
    };
  }

  // ===============================
  // Supabase + room session
  // ===============================
  let sb = null;
  let channel = null;
  let room = {
    code: null,
    meId: uid(),
    myName: null,
    myColorId: null,
    isHost: false,
    playerCount: 4,
  };

  let state = null;
  let lastRoomRow = null;

  // Broadcast event types
  const EVT = {
    SNAP: "snap",
    ROLL: "roll",
    MOVE: "move",
    LOBBY: "lobby",
  };

  function setNet(text) {
    netState.textContent = text;
    netState2.textContent = text;
  }

  async function initSupabase() {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }

  function roomCodeNorm(s) {
    return (s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  }

  async function createRoom() {
    const code = roomCodeNorm(roomCode.value) || randomCode();
    room.code = code;
    room.playerCount = parseInt(playerCountSel.value, 10) || 4;
    room.myName = safeText(yourName.value || "Host");
    room.isHost = true;

    const settings = {
      extraTurnOnSix: optExtraTurnOnSix.checked,
      autoMove: optAutoMove.checked,
    };

    const s = makeInitialState(code, room.meId, room.playerCount, settings);
    state = s;

    await sb.from(TABLE_ROOMS).upsert({
      code,
      host_id: room.meId,
      state: s,
      updated_at: new Date().toISOString(),
    });

    // players table
    await sb.from(TABLE_PLAYERS).insert({
      code,
      player_id: room.meId,
      name: room.myName,
      color_id: s.players[0].colorId,
      is_host: true,
      joined_at: new Date().toISOString(),
    });

    room.myColorId = s.players[0].colorId;

    await joinRealtime(code);
    showLobbyState();
    renderAll();
  }

  async function joinRoom() {
    const code = roomCodeNorm(roomCode.value);
    if (!code) return toast("Adj meg kódot!");
    room.code = code;
    room.isHost = false;
    room.myName = safeText(yourName.value || "Játékos");

    // load room
    const { data, error } = await sb.from(TABLE_ROOMS).select("*").eq("code", code).maybeSingle();
    if (error || !data) return toast("Nincs ilyen szoba.");

    lastRoomRow = data;
    state = data.state;

    // pick free color
    const used = new Set(state.players.map((p) => p.colorId));
    const free = COLORS.map((c) => c.id).find((id) => !used.has(id));
    if (!free) return toast("Tele a szoba.");

    room.myColorId = free;
    state.players.push({
      id: room.meId,
      name: room.myName,
      colorId: free,
      finished: 0,
    });

    // add pieces
    for (let i = 0; i < 4; i++) {
      state.pieces.push({
        id: uid(),
        playerId: free,
        idx: i,
        state: "home",
        trackIndex: null,
        stretchIndex: null,
      });
    }

    state.updatedAt = now();
    await pushSnap(state);

    await sb.from(TABLE_PLAYERS).insert({
      code,
      player_id: room.meId,
      name: room.myName,
      color_id: free,
      is_host: false,
      joined_at: new Date().toISOString(),
    });

    await joinRealtime(code);
    showLobbyState();
    renderAll();
  }

  function randomCode() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 6; i++) out += chars[(Math.random() * chars.length) | 0];
    return out;
  }

  async function joinRealtime(code) {
    if (channel) {
      await channel.unsubscribe();
      channel = null;
    }

    channel = sb.channel(`room-${code}`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on("broadcast", { event: EVT.SNAP }, ({ payload }) => {
        if (payload?.state) applySnapshot(payload.state, "snap");
      })
      .on("broadcast", { event: EVT.ROLL }, ({ payload }) => {
        if (payload) onRemoteRoll(payload);
      })
      .on("broadcast", { event: EVT.MOVE }, ({ payload }) => {
        if (payload) onRemoteMove(payload);
      })
      .subscribe((status) => {
        setNet(status);
      });
  }

  async function pushSnap(s) {
    const payload = { state: s };
    await channel.send({ type: "broadcast", event: EVT.SNAP, payload });
  }

  // Host writes room row to DB; others mostly broadcast.
  async function saveRoomStateToDB(s) {
    if (!room.isHost) return;
    await sb.from(TABLE_ROOMS).update({
      state: s,
      updated_at: new Date().toISOString(),
    }).eq("code", room.code);
  }

  function toast(msg) {
    hintEl.textContent = msg;
  }

  function showLobbyState() {
    lobbyState.hidden = false;
    roomCodeBig.textContent = room.code;
    roomCodeText.textContent = room.code;
    roomBar.hidden = false;
    btnLeave.disabled = false;

    renderPlayersList();
    renderScore();
  }

  function renderPlayersList() {
    playersList.innerHTML = "";
    state.players.forEach((p) => {
      const div = document.createElement("div");
      div.className = "pcard";
      div.innerHTML = `
        <div class="left">
          <span class="dot" style="background:${colorHex(p.colorId)}"></span>
          <span class="nm">${safeText(p.name)}</span>
        </div>
        <div class="st">${p.id === state.hostId ? "HOST" : ""}</div>
      `;
      playersList.appendChild(div);
    });
  }

  // ===============================
  // Dice + move actions
  // ===============================
  function currentPlayer(s) {
    if (!s?.players?.length) return null;
    return s.players[s.turnIdx % s.players.length];
  }

  function isMyTurn() {
    const cp = currentPlayer(state);
    return cp && room.myColorId === cp.colorId;
  }

  function canRoll() {
    return state && state.status === "playing" && state.phase === "awaitRoll" && isMyTurn();
  }

  function canPick() {
    if (!state || state.status !== "playing") return false;
    if (state.phase !== "needPick") return false;
    if (!isMyTurn()) return false;
    if (state.rollUntil && now() < state.rollUntil) return false; // lock while dice rolling
    return true;
  }

  async function actStartGame() {
    if (!room.isHost) return;
    if (state.status !== "lobby") return;

    if (state.players.length < 2) return toast("Min. 2 játékos kell.");

    state.status = "playing";
    state.phase = "awaitRoll";
    state.turnIdx = 0;
    state.die = null;
    state.movablePieceIds = [];
    state.updatedAt = now();
    state.log.unshift("Játék indul!");

    await pushSnap(state);
    await saveRoomStateToDB(state);
    closeLobby();
    renderAll();
  }

  function closeLobby() {
    lobbyModal.classList.remove("show");
    lobbyModal.setAttribute("aria-hidden", "true");
  }

  async function actRoll() {
    if (!canRoll()) return;

    const die = ((Math.random() * 6) | 0) + 1;
    const startAt = now() + 150;
    const dur = 1000;

    state.die = die;
    state.phase = "needPick";
    state.rollStartAt = startAt;
    state.rollUntil = startAt + dur;
    state.updatedAt = now();

    // Compute movable after roll (but UI won't highlight until rollUntil)
    state.movablePieceIds = getMovablePieces(state, die);

    // Broadcast roll so everyone anims same time
    await channel.send({
      type: "broadcast",
      event: EVT.ROLL,
      payload: { die, startAt, dur, byColor: room.myColorId },
    });

    await pushSnap(state);
    await saveRoomStateToDB(state);

    // Auto-move if single option (after roll anim)
    await sleep(Math.max(0, state.rollUntil - now()));
    if (state.movablePieceIds.length === 1) {
      await actPick(state.movablePieceIds[0], true);
    }

    renderAll();
  }

  async function onRemoteRoll(payload) {
    // Everyone shows the same dice animation at payload.startAt
    const wait = payload.startAt - now();
    if (wait > 0) await sleep(wait);
    diceRollAnim(payload.die, payload.dur || 1000);
    renderAll();
  }

  // ===============================
  // Move planning
  // ===============================
  function pieceToPos(s, piece) {
    const c = colorById[piece.playerId];
    if (piece.state === "home") {
      const [x, y] = c.homeSlots[piece.idx];
      return { x: x + 0.5, y: y + 0.5 };
    }
    if (piece.state === "track") {
      const [x, y] = PATH[piece.trackIndex];
      return { x: x + 0.5, y: y + 0.5 };
    }
    if (piece.state === "homeStretch") {
      const [x, y] = c.homeStretch[piece.stretchIndex];
      return { x: x + 0.5, y: y + 0.5 };
    }
    if (piece.state === "finished") {
      return { x: c.finishSpot[0], y: c.finishSpot[1] };
    }
    return { x: 7.5, y: 7.5 };
  }

  function isPieceProtectedOnTrack(victimPiece, trackIndex) {
    // Only protected for its own color:
    if (trackIndex === START_INDEX[victimPiece.playerId]) return true;
    if (isProtectedTrackForColor(victimPiece.playerId, trackIndex)) return true;
    return false;
  }

  function logicalToXY(colorId, logical) {
    const c = colorById[colorId];
    if (logical.zone === "track") {
      const [x, y] = PATH[logical.trackIndex];
      return { x: x + 0.5, y: y + 0.5 };
    }
    if (logical.zone === "stretch") {
      const [x, y] = c.homeStretch[logical.stretchIndex];
      return { x: x + 0.5, y: y + 0.5 };
    }
    if (logical.zone === "finish") {
      return { x: c.finishSpot[0], y: c.finishSpot[1] };
    }
    return { x: 7.5, y: 7.5 };
  }

  function simulateLogicalStepsFrom(s, piece, die) {
    const colorId = piece.playerId;
    const entry = HOME_ENTRY_INDEX[colorId];

    if (piece.state === "home") {
      if (die !== 6) return null;
      const startIdx = START_INDEX[colorId];
      return [{ zone: "track", trackIndex: startIdx }];
    }

    let pos;
    if (piece.state === "track") pos = { zone: "track", trackIndex: piece.trackIndex };
    else if (piece.state === "homeStretch") pos = { zone: "stretch", stretchIndex: piece.stretchIndex };
    else return null;

    let mode = "forward";
    const out = [];
    let step = 0;

    while (step < die) {
      if (mode === "forward") {
        if (pos.zone === "track") {
          if (pos.trackIndex === entry) {
            pos = { zone: "stretch", stretchIndex: 0 };
          } else {
            pos = { zone: "track", trackIndex: trackStep(pos.trackIndex, TRACK_DIR) };
          }
          out.push(pos);
          step += 1;
          continue;
        }

        if (pos.zone === "stretch") {
          if (pos.stretchIndex === 5) {
            const rem = die - step;
            if (rem === 1) {
              pos = { zone: "finish" };
              out.push(pos);
              step += 1;
              break;
            }
            mode = "back";
            continue;
          }

          pos = { zone: "stretch", stretchIndex: pos.stretchIndex + 1 };
          out.push(pos);
          step += 1;
          continue;
        }
        break;
      } else {
        if (pos.zone === "stretch") {
          if (pos.stretchIndex === 0) {
            pos = { zone: "track", trackIndex: entry };
          } else {
            pos = { zone: "stretch", stretchIndex: pos.stretchIndex - 1 };
          }
          out.push(pos);
          step += 1;
          continue;
        }

        if (pos.zone === "track") {
          pos = { zone: "track", trackIndex: trackStep(pos.trackIndex, TRACK_BACK_DIR) };
          out.push(pos);
          step += 1;
          continue;
        }
        break;
      }
    }

    return out;
  }

  function planMove(s, piece, die) {
    if (!die) return null;
    if (!piece || piece.state === "finished") return null;

    const stepsLogical = simulateLogicalStepsFrom(s, piece, die);
    if (!stepsLogical) return null;

    const colorId = piece.playerId;

    const steps = [];
    steps.push(pieceToPos(s, piece));
    for (const lg of stepsLogical) {
      steps.push(logicalToXY(colorId, lg));
    }

    const last = stepsLogical[stepsLogical.length - 1];
    let mv = null;
    if (last.zone === "finish") {
      mv = { state: "finished", trackIndex: null, stretchIndex: null };
    } else if (last.zone === "track") {
      mv = { state: "track", trackIndex: last.trackIndex, stretchIndex: null };
    } else if (last.zone === "stretch") {
      mv = { state: "homeStretch", trackIndex: null, stretchIndex: last.stretchIndex };
    }

    // Capture check (unlimited stack; capture if not protected)
    const captures = [];
    if (mv && mv.state === "track") {
      const landing = mv.trackIndex;
      const victims = s.pieces.filter(
        (pp) => pp.state === "track" && pp.trackIndex === landing && pp.playerId !== colorId
      );
      for (const v of victims) {
        if (!isPieceProtectedOnTrack(v, landing)) captures.push(v.id);
      }
    }

    return { mv, steps, captures };
  }

  function getMovablePieces(s, die) {
    const cp = currentPlayer(s);
    if (!cp) return [];
    const pieces = s.pieces.filter((p) => p.playerId === cp.colorId);
    const res = [];
    for (const p of pieces) {
      const mv = planMove(s, p, die);
      if (mv && mv.mv) res.push(p.id);
    }
    return res;
  }

  // ===============================
  // Apply move to state
  // ===============================
  function applyMoveToState(prev, pieceId, mv, captures) {
    const s = deepClone(prev);
    const piece = s.pieces.find((p) => p.id === pieceId);
    if (!piece) return s;

    const actor = currentPlayer(s);

    piece.state = mv.state;
    piece.trackIndex = mv.trackIndex ?? null;
    piece.stretchIndex = mv.stretchIndex ?? null;

    if (Array.isArray(captures) && captures.length) {
      let cnt = 0;
      for (const vid of captures) {
        const v = s.pieces.find((pp) => pp.id === vid);
        if (!v) continue;
        v.state = "home";
        v.trackIndex = null;
        v.stretchIndex = null;
        cnt += 1;
      }
      if (cnt) s.log.unshift(`${actor.name} ütött: ${cnt} bábu haza.`);
    }

    if (piece.state === "finished") {
      const pl = s.players.find((p) => p.colorId === actor.colorId);
      if (pl) {
        pl.finished = (pl.finished || 0) + 1;
        s.log.unshift(`${actor.name} beért! (${pl.finished}/4)`);
      }
    }

    const pl2 = s.players.find((p) => p.colorId === actor.colorId);
    if (pl2 && (pl2.finished || 0) >= 4) {
      s.status = "ended";
      s.winnerId = pl2.id;
      s.log.unshift(`NYERTES: ${pl2.name}`);
    }

    if (s.log.length > 80) s.log.length = 80;
    s.updatedAt = now();
    return s;
  }

  function nextTurn(s, extra) {
    if (extra) return s;
    s.turnIdx = (s.turnIdx + 1) % s.players.length;
    return s;
  }

  async function actPick(pieceId, auto = false) {
    if (!canPick()) return;
    if (!state.movablePieceIds.includes(pieceId)) return;

    const p = state.pieces.find((x) => x.id === pieceId);
    const plan = planMove(state, p, state.die);
    if (!plan || !plan.mv) return;

    // Start anim
    state.phase = "animating";
    state.updatedAt = now();
    await pushSnap(state);
    await saveRoomStateToDB(state);

    // Broadcast MOVE animation path so everyone anims same
    await channel.send({
      type: "broadcast",
      event: EVT.MOVE,
      payload: {
        pieceId,
        die: state.die,
        byColor: room.myColorId,
        steps: plan.steps,
        mv: plan.mv,
        captures: plan.captures,
      },
    });

    // Locally animate too
    await animateMove(pieceId, plan.steps);

    // Apply move result
    state = applyMoveToState(state, pieceId, plan.mv, plan.captures);

    // Extra turn logic:
    // - 6 => extra
    // - finished => extra
    // - if 6+finished => still only one extra (same boolean)
    let extra = false;
    if (state.die === 6) extra = true;
    if (plan.mv.state === "finished") extra = true;

    state.die = null;
    state.rollStartAt = null;
    state.rollUntil = null;
    state.movablePieceIds = [];
    if (state.status !== "ended") {
      nextTurn(state, extra && state.settings.extraTurnOnSix);
      state.phase = "awaitRoll";
    }

    await pushSnap(state);
    await saveRoomStateToDB(state);

    renderAll();
  }

  async function onRemoteMove(payload) {
    // Remote animation for all clients (including self, but ok)
    if (!payload?.pieceId || !Array.isArray(payload.steps)) return;
    await animateMove(payload.pieceId, payload.steps);
    renderAll();
  }

  // ===============================
  // SVG Board rendering
  // ===============================
  let svg = null;
  let gCells = null;
  let gTargets = null;
  let gPieces = null;
  let gDice = null;

  function buildSVG() {
    boardEl.innerHTML = "";
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 15 15");
    svg.setAttribute("aria-label", "board");
    boardEl.appendChild(svg);

    gCells = document.createElementNS(svg.namespaceURI, "g");
    gTargets = document.createElementNS(svg.namespaceURI, "g");
    gPieces = document.createElementNS(svg.namespaceURI, "g");
    gDice = document.createElementNS(svg.namespaceURI, "g");

    svg.appendChild(gCells);
    svg.appendChild(gTargets);
    svg.appendChild(gPieces);
    svg.appendChild(gDice);

    drawCells();
    drawDice();
  }

  function drawCells() {
    // background cells
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        const r = document.createElementNS(svg.namespaceURI, "rect");
        r.setAttribute("x", x);
        r.setAttribute("y", y);
        r.setAttribute("width", 1);
        r.setAttribute("height", 1);

        const isPath = PATH.some((p) => p[0] === x && p[1] === y);
        const isCenter = x >= 6 && x <= 8 && y >= 6 && y <= 8;
        r.setAttribute("class", `cell ${isPath ? "path" : ""} ${isCenter ? "center" : ""}`);

        let fill = "#ffffff";

        // paint home squares lightly
        for (const c of COLORS) {
          const inHome =
            (c.id === "green" && x <= 5 && y <= 5) ||
            (c.id === "yellow" && x >= 9 && y <= 5) ||
            (c.id === "red" && x >= 9 && y >= 9) ||
            (c.id === "blue" && x <= 5 && y >= 9);

          if (inHome) fill = c.hex + "22";
        }

        // paint home stretch
        for (const c of COLORS) {
          for (const [sx, sy] of c.homeStretch) {
            if (sx === x && sy === y) fill = c.hex + "33";
          }
        }

        // paint start cell as player color
        for (const c of COLORS) {
          if (c.start[0] === x && c.start[1] === y) fill = c.hex + "55";
        }

        r.setAttribute("fill", fill);
        gCells.appendChild(r);
      }
    }
  }
  // Dice (center)
  let diceRoot = null;
  let diceRect = null;
  let diceFace = null;
  let diceHint = null;
  let diceSub = null;
  let diceInnerG = null;

  function drawDice() {
    diceRoot = document.createElementNS(svg.namespaceURI, "g");
    diceRoot.setAttribute("class", "diceRoot");
    diceRoot.setAttribute("transform", `translate(7.5 7.05)`);

    diceInnerG = document.createElementNS(svg.namespaceURI, "g");
    diceRoot.appendChild(diceInnerG);

    diceRect = document.createElementNS(svg.namespaceURI, "rect");
    diceRect.setAttribute("x", -1.15);
    diceRect.setAttribute("y", -1.15);
    diceRect.setAttribute("width", 2.3);
    diceRect.setAttribute("height", 2.3);
    diceRect.setAttribute("rx", 0.35);
    diceRect.setAttribute("class", "diceBox");
    diceInnerG.appendChild(diceRect);

    diceFace = document.createElementNS(svg.namespaceURI, "text");
    diceFace.setAttribute("x", 0);
    diceFace.setAttribute("y", 0.25);
    diceFace.setAttribute("text-anchor", "middle");
    diceFace.setAttribute("class", "diceFaceText");
    diceFace.textContent = "—";
    diceInnerG.appendChild(diceFace);

    diceSub = document.createElementNS(svg.namespaceURI, "text");
    diceSub.setAttribute("x", 0);
    diceSub.setAttribute("y", 0.85);
    diceSub.setAttribute("text-anchor", "middle");
    diceSub.setAttribute("class", "diceSubText");
    diceSub.textContent = "";
    diceInnerG.appendChild(diceSub);

    diceHint = document.createElementNS(svg.namespaceURI, "text");
    diceHint.setAttribute("x", 0);
    diceHint.setAttribute("y", 1.25);
    diceHint.setAttribute("text-anchor", "middle");
    diceHint.setAttribute("class", "diceHintText");
    diceHint.textContent = "";
    diceInnerG.appendChild(diceHint);

    diceRoot.addEventListener("click", () => {
      if (canRoll()) actRoll();
    });

    gDice.appendChild(diceRoot);
    setDiceFace("—");
  }

  function setDiceFace(v) {
    diceFace.textContent = v;
  }

  async function diceRollAnim(finalDie, duration = 1000) {
    diceInnerG.classList.add("diceRolling");
    const start = now();
    while (now() - start < duration) {
      setDiceFace(((Math.random() * 6) | 0) + 1);
      await sleep(70);
    }
    setDiceFace(finalDie);
    diceInnerG.classList.remove("diceRolling");
  }

  // ===============================
  // Pieces rendering + targets
  // ===============================
  function clearGroup(g) {
    while (g.firstChild) g.removeChild(g.firstChild);
  }

  function renderTargets() {
    clearGroup(gTargets);
    if (!state || state.status !== "playing") return;
    if (!canPick()) return;
    if (!state.die) return;
    if (state.rollUntil && now() < state.rollUntil) return;

    // show target previews for movable pieces
    for (const pid of state.movablePieceIds) {
      const p = state.pieces.find((x) => x.id === pid);
      const plan = planMove(state, p, state.die);
      if (!plan || !plan.mv) continue;
      const pos = plan.steps[plan.steps.length - 1];

      const g = document.createElementNS(svg.namespaceURI, "g");
      g.setAttribute("class", "target");
      g.setAttribute("transform", `translate(${pos.x} ${pos.y})`);

      const ring = document.createElementNS(svg.namespaceURI, "circle");
      ring.setAttribute("r", 0.45);
      ring.setAttribute("class", "t-ring");
      ring.setAttribute("stroke", colorHex(p.playerId));
      g.appendChild(ring);

      const dot = document.createElementNS(svg.namespaceURI, "circle");
      dot.setAttribute("r", 0.08);
      dot.setAttribute("class", "t-dot");
      g.appendChild(dot);

      gTargets.appendChild(g);
    }
  }

  function renderPieces() {
    clearGroup(gPieces);
    if (!state) return;

    // stack positions: spread in a circle if multiple pieces on same coordinate
    const occ = new Map();
    for (const p of state.pieces) {
      const pos = pieceToPos(state, p);
      const key = `${pos.x.toFixed(2)}|${pos.y.toFixed(2)}`;
      if (!occ.has(key)) occ.set(key, []);
      occ.get(key).push(p.id);
    }

    for (const p of state.pieces) {
      const base = pieceToPos(state, p);
      const key = `${base.x.toFixed(2)}|${base.y.toFixed(2)}`;
      const ids = occ.get(key) || [p.id];
      const n = ids.length;
      const i = ids.indexOf(p.id);

      let x = base.x;
      let y = base.y;
      let scale = 1.0;

      if (n > 1) {
        const ang = (i / n) * Math.PI * 2;
        const r = 0.22;
        x = base.x + Math.cos(ang) * r;
        y = base.y + Math.sin(ang) * r;
        scale = clamp(1.0 - (n - 1) * 0.10, 0.55, 1.0);
      }

      const g = document.createElementNS(svg.namespaceURI, "g");
      g.setAttribute("class", "pawn");
      g.setAttribute("transform", `translate(${x} ${y}) scale(${scale})`);

      const ring = document.createElementNS(svg.namespaceURI, "circle");
      ring.setAttribute("r", 0.45);
      ring.setAttribute("fill", colorHex(p.playerId));
      ring.setAttribute("stroke", "rgba(0,0,0,.25)");
      ring.setAttribute("stroke-width", "0.06");
      g.appendChild(ring);

      const ring2 = document.createElementNS(svg.namespaceURI, "circle");
      ring2.setAttribute("r", 0.52);
      ring2.setAttribute("class", "ring");
      ring2.setAttribute("stroke", colorHex(p.playerId));
      g.appendChild(ring2);

      const label = document.createElementNS(svg.namespaceURI, "text");
      label.setAttribute("x", 0);
      label.setAttribute("y", 0.18);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "0.35");
      label.setAttribute("font-weight", "1000");
      label.setAttribute("fill", "rgba(255,255,255,.95)");
      label.textContent = (p.idx + 1).toString();
      g.appendChild(label);

      const hit = document.createElementNS(svg.namespaceURI, "circle");
      hit.setAttribute("r", 0.62);
      hit.setAttribute("class", "hit");
      g.appendChild(hit);

      const rollDone = !state.rollUntil || now() >= state.rollUntil;
      const movable =
        rollDone &&
        state.status === "playing" &&
        state.phase === "needPick" &&
        isMyTurn() &&
        state.movablePieceIds.includes(p.id);

      if (movable) g.classList.add("movable");

      hit.addEventListener("click", () => {
        if (!canPick()) return;
        if (!state.movablePieceIds.includes(p.id)) return;
        actPick(p.id, false);
      });

      gPieces.appendChild(g);
    }
  }

  // ===============================
  // Move animation
  // ===============================
  async function animateMove(pieceId, steps) {
    // Simple hop animation by re-rendering quickly.
    // If you want smoother: keep DOM refs; this is fine for now.
    const STEP_DELAY = 260;
    for (let i = 1; i < steps.length; i++) {
      // apply temporary position
      const p = state.pieces.find((x) => x.id === pieceId);
      if (!p) break;

      // hack: set a temp field to override draw pos
      p.__tmp = { x: steps[i].x, y: steps[i].y };
      renderPieces();
      renderTargets();
      renderDiceOverlay();
      await sleep(STEP_DELAY);
      delete p.__tmp;
    }
  }

  // ===============================
  // Dice overlay + HUD
  // ===============================
  function renderDiceOverlay() {
    if (!state) return;
    const cp = currentPlayer(state);
    if (cp) {
      diceRect.setAttribute("stroke", colorHex(cp.colorId));
      diceSub.textContent = safeText(cp.name || "");
      turnDot.style.background = colorHex(cp.colorId);
      turnName.textContent = `${safeText(cp.name)} jön`;
      turnMeta.textContent = state.status === "playing" ? (isMyTurn() ? "Te jössz" : "Várj...") : "—";
    } else {
      diceRect.setAttribute("stroke", "rgba(0,0,0,.35)");
      diceSub.textContent = "";
      turnName.textContent = "—";
      turnMeta.textContent = "—";
    }

    // hint
    if (state.status !== "playing") {
      diceHint.textContent = "";
    } else if (state.phase === "awaitRoll") {
      diceHint.textContent = isMyTurn() ? "Katt: DOBÁS" : "—";
    } else if (state.phase === "needPick") {
      if (state.rollUntil && now() < state.rollUntil) diceHint.textContent = "Dobás...";
      else diceHint.textContent = isMyTurn() ? "Válassz bábut" : "—";
    } else {
      diceHint.textContent = "Lépés...";
    }

    // face
    setDiceFace(state.die || "—");
  }

  function renderScore() {
    scoreEl.innerHTML = "";
    if (!state?.players?.length) return;

    for (const p of state.players) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="left">
          <span class="c-dot" style="background:${colorHex(p.colorId)}"></span>
          <span class="name">${safeText(p.name)}</span>
        </div>
        <div class="meta">${(p.finished || 0)}/4</div>
      `;
      scoreEl.appendChild(card);
    }
  }

  function renderLog() {
    logEl.innerHTML = "";
    const items = (state?.log || []).slice(0, 30);
    for (const t of items) {
      const div = document.createElement("div");
      div.className = "item";
      div.textContent = t;
      logEl.appendChild(div);
    }
  }

  function openWin(name) {
    winText.textContent = `NYERT: ${safeText(name)}`;
    winModal.classList.add("show");
    winModal.setAttribute("aria-hidden", "false");
  }

  // ===============================
  // Snapshot apply + render loop
  // ===============================
  function applySnapshot(s, reason) {
    state = s;
    renderAll();

    if (state.status === "ended") {
      const w = state.players.find((p) => p.id === state.winnerId) || state.players[0];
      openWin(w?.name || "Valaki");
    }
  }

  function renderAll() {
    if (!svg) buildSVG();

    // override temp pos in animation
    const origPieceToPos = pieceToPos;
    pieceToPos = (s, piece) => {
      if (piece.__tmp) return piece.__tmp;
      return origPieceToPos(s, piece);
    };

    renderTargets();
    renderPieces();
    renderDiceOverlay();
    renderScore();
    renderLog();

    // buttons
    btnStart.hidden = !room.isHost || state?.status !== "lobby";
    btnStartMain.hidden = !room.isHost || state?.status !== "lobby";
    btnStart.disabled = !(room.isHost && state?.players?.length >= 2);
    btnStartMain.disabled = btnStart.disabled;

    btnRoll.disabled = !canRoll();
    btnSkip.disabled = !(state && state.status === "playing" && isMyTurn());

    // room UI
    if (room.code) {
      roomCodeText.textContent = room.code;
      roomCodeBig.textContent = room.code;
      roomBar.hidden = false;
    }
  }

  // ===============================
  // UI events
  // ===============================
  btnRules.addEventListener("click", () => {
    rulesModal.classList.add("show");
    rulesModal.setAttribute("aria-hidden", "false");
  });
  btnCloseRules.addEventListener("click", () => {
    rulesModal.classList.remove("show");
    rulesModal.setAttribute("aria-hidden", "true");
  });

  btnCloseWin.addEventListener("click", () => {
    winModal.classList.remove("show");
    winModal.setAttribute("aria-hidden", "true");
  });
  btnBackLobby.addEventListener("click", () => {
    window.location.reload();
  });

  btnCreate.addEventListener("click", async () => {
    await createRoom();
  });
  btnJoin.addEventListener("click", async () => {
    await joinRoom();
  });

  btnStart.addEventListener("click", async () => {
    await actStartGame();
  });
  btnStartMain.addEventListener("click", async () => {
    await actStartGame();
  });

  btnRoll.addEventListener("click", async () => {
    await actRoll();
  });

  btnSkip.addEventListener("click", async () => {
    if (!state || state.status !== "playing" || !isMyTurn()) return;
    state.die = null;
    state.movablePieceIds = [];
    state.phase = "awaitRoll";
    nextTurn(state, false);
    state.updatedAt = now();
    await pushSnap(state);
    await saveRoomStateToDB(state);
    renderAll();
  });

  btnLeave.addEventListener("click", () => {
    window.location.reload();
  });

  btnCopy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(room.code || "");
    toast("Kód másolva.");
  });
  btnCopyBig.addEventListener("click", async () => {
    await navigator.clipboard.writeText(room.code || "");
    toast("Kód másolva.");
  });

  // ===============================
  // Boot
  // ===============================
  (async function boot() {
    await initSupabase();
    setNet("ready");
    renderAll();
  })();
})();
