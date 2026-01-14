/* Ki nevet a végén (Ludo) – egyszerű, működő web verzió (GitHub Pages)
   - Multiplayer: helyi hotseat (egy eszközön, körökre)
*/

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  // ----- RNG (jobb, mint Math.random) -----
  function rollDie() {
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return (a[0] % 6) + 1;
    } catch {
      return (Math.floor(Math.random() * 6) + 1);
    }
  }

  // ----- Board / Path (15x15) -----
  // 52 mező a körön (klasszik 15x15 Ludo layout)
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

  const COLORS = [
    {
      id: "green",
      label: "Zöld",
      hex: getCSS("--green"),
      startCoord: [1,6],
      homeSlots: [[2,2],[4,2],[2,4],[4,4]],
      homeStretch: [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
      finishSpot: [6.75, 6.75],
    },
    {
      id: "yellow",
      label: "Sárga",
      hex: getCSS("--yellow"),
      startCoord: [8,1],
      homeSlots: [[10,2],[12,2],[10,4],[12,4]],
      homeStretch: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
      finishSpot: [8.25, 6.75],
    },
    {
      id: "red",
      label: "Piros",
      hex: getCSS("--red"),
      startCoord: [13,8],
      homeSlots: [[10,10],[12,10],[10,12],[12,12]],
      homeStretch: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
      finishSpot: [8.25, 8.25],
    },
    {
      id: "blue",
      label: "Kék",
      hex: getCSS("--blue"),
      startCoord: [6,13],
      homeSlots: [[2,10],[4,10],[2,12],[4,12]],
      homeStretch: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
      finishSpot: [6.75, 8.25],
    },
  ];

  const START_INDEX = Object.fromEntries(COLORS.map(c => [c.id, PATH.findIndex(p => p[0] === c.startCoord[0] && p[1] === c.startCoord[1])]));
  const HOME_ENTRY_INDEX = Object.fromEntries(Object.keys(START_INDEX).map(id => [id, (START_INDEX[id] + PATH.length - 1) % PATH.length]));
  const SAFE_CELLS = new Set(Object.values(START_INDEX).map(i => cellKey(PATH[i][0], PATH[i][1]))); // start mezők védettek

  // ----- DOM -----
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

  const setupModal = $("#setupModal");
  const rulesModal = $("#rulesModal");
  const winModal = $("#winModal");

  const btnRules = $("#btnRules");
  const btnNew = $("#btnNew");
  const btnCloseSetup = $("#btnCloseSetup");
  const btnStart = $("#btnStart");
  const playerCountSel = $("#playerCount");
  const nameFields = $("#nameFields");
  const optExtraTurnOnSix = $("#optExtraTurnOnSix");
  const optAutoMove = $("#optAutoMove");

  const btnCloseRules = $("#btnCloseRules");
  const btnCloseWin = $("#btnCloseWin");
  const btnRestart = $("#btnRestart");
  const winText = $("#winText");

  // ----- Game State -----
  let ui = {
    extraTurnOnSix: true,
    autoMove: true,
  };

  let game = null; // {players, pieces, turnIdx, phase, die, movablePieceIds, sixStreak}
  // phase: "needRoll" | "needPick" | "ended"

  function newGame(config) {
    const selected = selectPlayers(config.count);
    const players = selected.map((c, i) => ({
      ...c,
      name: (config.names[c.id] || c.label).trim() || c.label,
      idx: i,
      finished: 0,
    }));

    const pieces = [];
    players.forEach((p) => {
      for (let i = 0; i < 4; i++) {
        pieces.push({
          id: `${p.id}-${i}`,
          playerId: p.id,
          n: i,
          state: "home", // home | track | homeStretch | finished
          trackIndex: null,
          stretchIndex: null,
        });
      }
    });

    game = {
      players,
      pieces,
      turnIdx: 0,
      phase: "needRoll",
      die: null,
      movablePieceIds: [],
      sixStreak: 0,
    };

    setDice("—", "Dobásra vár");
    logClear();
    logLine(`Indult: ${players.map(p => `<b>${escapeHtml(p.name)}</b>`).join(", ")}`);
    renderAll();
    setHint("Dobj a kockával.");
  }

  function selectPlayers(count) {
    // 2: Zöld+Piros, 3: Zöld+Sárga+Piros, 4: mind
    if (count === 2) return [COLORS[0], COLORS[2]];
    if (count === 3) return [COLORS[0], COLORS[1], COLORS[2]];
    return COLORS.slice(0, 4);
  }

  // ----- Movement Rules -----
  function computeLegalMove(piece, die) {
    if (!die) return null;

    const player = game.players.find(p => p.id === piece.playerId);
    const c = COLORS.find(x => x.id === piece.playerId);

    if (piece.state === "finished") return null;

    // 1) Home -> Start only with 6
    if (piece.state === "home") {
      if (die !== 6) return null;

      const target = { state: "track", trackIndex: START_INDEX[c.id], stretchIndex: null, finished: false };
      if (!isTrackLandingAllowed(piece.playerId, PATH[target.trackIndex])) return null;

      return { ...target, kind: "homeOut" };
    }

    // 2) Track movement + entering home stretch
    if (piece.state === "track") {
      const cur = piece.trackIndex;

      const entry = HOME_ENTRY_INDEX[c.id];
      const distToEntry = (entry - cur + PATH.length) % PATH.length;

      // stays on track
      if (die <= distToEntry) {
        const newIndex = (cur + die) % PATH.length;
        const coord = PATH[newIndex];
        if (!isTrackLandingAllowed(piece.playerId, coord)) return null;
        return { state: "track", trackIndex: newIndex, stretchIndex: null, kind: "track" };
      }

      // goes into home stretch
      const into = die - distToEntry - 1; // after stepping onto entry, next step goes to stretch[0]
      if (into < 0) return null;
      if (into > 5) return null; // cannot overshoot
      return { state: "homeStretch", trackIndex: null, stretchIndex: into, kind: "enterHome" };
    }

    // 3) Home stretch
    if (piece.state === "homeStretch") {
      const newIdx = piece.stretchIndex + die;
      if (newIdx > 6) return null;
      if (newIdx === 6) {
        return { state: "finished", trackIndex: null, stretchIndex: null, kind: "finish" };
      }
      return { state: "homeStretch", trackIndex: null, stretchIndex: newIdx, kind: "homeStretch" };
    }

    return null;
  }

  function isTrackLandingAllowed(playerId, coord) {
    // block rule: if an opponent has 2+ pieces on target coord -> cannot land
    const occ = getTrackOccupancy();
    const key = cellKey(coord[0], coord[1]);
    const bucket = occ.get(key);
    if (!bucket) return true;

    for (const [pid, count] of bucket.countByPlayer.entries()) {
      if (pid !== playerId && count >= 2) return false;
    }
    return true;
  }

  function applyMove(pieceId, move) {
    const piece = game.pieces.find(p => p.id === pieceId);
    const p = game.players.find(x => x.id === piece.playerId);
    const c = COLORS.find(x => x.id === piece.playerId);

    // Move
    piece.state = move.state;
    piece.trackIndex = move.trackIndex;
    piece.stretchIndex = move.stretchIndex;

    // Capture if ended on track (and not safe)
    if (piece.state === "track") {
      const coord = PATH[piece.trackIndex];
      const key = cellKey(coord[0], coord[1]);

      const isSafe = SAFE_CELLS.has(key);
      if (!isSafe) {
        const victims = game.pieces.filter(pp => (
          pp.id !== piece.id &&
          pp.state === "track" &&
          pp.trackIndex === piece.trackIndex &&
          pp.playerId !== piece.playerId
        ));

        if (victims.length) {
          victims.forEach(v => {
            v.state = "home";
            v.trackIndex = null;
            v.stretchIndex = null;
          });
          logLine(`<b>${escapeHtml(p.name)}</b> ütött: ${victims.length} bábu vissza haza.`);
        }
      }
    }

    // Finish
    if (piece.state === "finished") {
      p.finished += 1;
      logLine(`<b>${escapeHtml(p.name)}</b> beért! (${p.finished}/4)`);
    }
  }

  function getTrackOccupancy() {
    // Map key -> {countByPlayer: Map(playerId->count), pieceIds: []}
    const map = new Map();
    for (const piece of game.pieces) {
      if (piece.state !== "track") continue;
      const coord = PATH[piece.trackIndex];
      const key = cellKey(coord[0], coord[1]);
      if (!map.has(key)) map.set(key, { countByPlayer: new Map(), pieceIds: [] });
      const b = map.get(key);
      b.pieceIds.push(piece.id);
      b.countByPlayer.set(piece.playerId, (b.countByPlayer.get(piece.playerId) || 0) + 1);
    }
    return map;
  }

  // ----- Turn flow -----
  function currentPlayer() {
    return game.players[game.turnIdx];
  }

  function nextTurn(extra = false) {
    if (game.phase === "ended") return;
    if (!extra) {
      game.turnIdx = (game.turnIdx + 1) % game.players.length;
      game.sixStreak = 0;
    }
    game.phase = "needRoll";
    game.die = null;
    game.movablePieceIds = [];
    setDice("—", "Dobásra vár");
    renderAll();
    setHint("Dobj a kockával.");
  }

  function updateMovablePieces() {
    const die = game.die;
    const player = currentPlayer();

    const movable = [];
    for (const piece of game.pieces) {
      if (piece.playerId !== player.id) continue;
      const mv = computeLegalMove(piece, die);
      if (mv) movable.push(piece.id);
    }
    game.movablePieceIds = movable;
  }

  function onRoll() {
    if (!game || game.phase !== "needRoll") return;

    const die = rollDie();
    game.die = die;
    setDice(String(die), `Dobás: ${die}`);
    logLine(`<b>${escapeHtml(currentPlayer().name)}</b> dobott: <b>${die}</b>.`);

    updateMovablePieces();

    if (game.movablePieceIds.length === 0) {
      setHint("Nincs lépés. Mehet a következő.");
      game.phase = "needRoll";
      // automata továbblépés egy kicsi késleltetéssel
      setTimeout(() => nextTurn(false), 550);
      renderAll();
      return;
    }

    game.phase = "needPick";
    renderAll();
    setHint("Bökj egy kiemelt bábra.");

    if (ui.autoMove && game.movablePieceIds.length === 1) {
      const only = game.movablePieceIds[0];
      setTimeout(() => {
        if (game && game.phase === "needPick" && game.movablePieceIds.length === 1 && game.movablePieceIds[0] === only) {
          onPickPiece(only);
        }
      }, 420);
    }
  }

  function onPickPiece(pieceId) {
    if (!game || game.phase !== "needPick") return;
    if (!game.movablePieceIds.includes(pieceId)) return;

    const piece = game.pieces.find(p => p.id === pieceId);
    const player = currentPlayer();

    const mv = computeLegalMove(piece, game.die);
    if (!mv) return;

    applyMove(pieceId, mv);

    // Win?
    if (player.finished >= 4) {
      game.phase = "ended";
      renderAll();
      openWin(player);
      return;
    }

    // Extra turn on 6?
    const extra = (ui.extraTurnOnSix && game.die === 6);

    if (extra) {
      game.sixStreak += 1;
      // egyszerű védelem: ha 3 hatos egymás után, átadjuk a kört (nehogy végtelen pörögjön)
      if (game.sixStreak >= 3) {
        logLine(`<b>${escapeHtml(player.name)}</b> 3x hatos. Kör tovább.`);
        nextTurn(false);
        return;
      }
      logLine(`<b>${escapeHtml(player.name)}</b> 6-os! Még egy dobás.`);
      nextTurn(true);
      return;
    }

    nextTurn(false);
  }

  function onSkip() {
    if (!game || game.phase === "ended") return;
    if (game.phase === "needPick") {
      // ha mégis passzolna (pl. safe share logika miatt), engedjük
      logLine(`<b>${escapeHtml(currentPlayer().name)}</b> passzolt.`);
      nextTurn(false);
      return;
    }
    if (game.phase === "needRoll") {
      logLine(`<b>${escapeHtml(currentPlayer().name)}</b> passzolt dobás nélkül.`);
      nextTurn(false);
    }
  }

  // ----- Board Rendering (SVG) -----
  let svg = null;
  let gPieces = null;
  const pawnEls = new Map(); // pieceId -> g

  function buildBoard() {
    elBoard.innerHTML = "";

    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 15 15");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    // Cells
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        const rect = document.createElementNS(svg.namespaceURI, "rect");
        rect.setAttribute("x", x);
        rect.setAttribute("y", y);
        rect.setAttribute("width", 1);
        rect.setAttribute("height", 1);

        const info = getCellInfo(x, y);
        rect.setAttribute("fill", info.fill);
        rect.setAttribute("class", `cell ${info.cls}`);

        svg.appendChild(rect);

        // small safe dot
        if (SAFE_CELLS.has(cellKey(x, y))) {
          const dot = document.createElementNS(svg.namespaceURI, "circle");
          dot.setAttribute("cx", x + 0.5);
          dot.setAttribute("cy", y + 0.5);
          dot.setAttribute("r", 0.08);
          dot.setAttribute("fill", "rgba(255,255,255,.55)");
          svg.appendChild(dot);
        }
      }
    }

    // Center triangles
    const tris = [
      { pts: "6,6 7.5,7.5 6,9", fill: withAlpha(getCSS("--green"), 0.45) },
      { pts: "6,6 7.5,7.5 9,6", fill: withAlpha(getCSS("--yellow"), 0.45) },
      { pts: "9,9 7.5,7.5 9,6", fill: withAlpha(getCSS("--red"), 0.45) },
      { pts: "6,9 7.5,7.5 9,9", fill: withAlpha(getCSS("--blue"), 0.45) },
    ];
    tris.forEach(t => {
      const poly = document.createElementNS(svg.namespaceURI, "polygon");
      poly.setAttribute("points", t.pts);
      poly.setAttribute("fill", t.fill);
      poly.setAttribute("class", "center");
      svg.appendChild(poly);
    });

    // "HOME" text (diszkrét)
    const tx = document.createElementNS(svg.namespaceURI, "text");
    tx.setAttribute("x", "7.5");
    tx.setAttribute("y", "7.9");
    tx.setAttribute("text-anchor", "middle");
    tx.setAttribute("font-size", "0.65");
    tx.setAttribute("font-weight", "900");
    tx.setAttribute("fill", "rgba(255,255,255,.22)");
    tx.textContent = "HOME";
    svg.appendChild(tx);

    // Pieces layer
    gPieces = document.createElementNS(svg.namespaceURI, "g");
    svg.appendChild(gPieces);

    elBoard.appendChild(svg);
  }

  function getCellInfo(x, y) {
    // Base background
    const bg = "#0b0f14";
    const pathBg = "#121a22";
    const centerBg = "#0f1620";

    // Determine types
    const inGreenHome = (x <= 5 && y <= 5);
    const inYellowHome = (x >= 9 && y <= 5);
    const inBlueHome = (x <= 5 && y >= 9);
    const inRedHome = (x >= 9 && y >= 9);
    const inCenter = (x >= 6 && x <= 8 && y >= 6 && y <= 8);

    const k = cellKey(x, y);
    const isPath = PATH_SET.has(k);
    const hs = HOME_STRETCH_MAP.get(k); // {id}
    const isHomeStretch = !!hs;

    if (inCenter) return { fill: centerBg, cls: "center" };

    // home quadrants
    if (inGreenHome) return { fill: withAlpha(getCSS("--green"), 0.08), cls: "" };
    if (inYellowHome) return { fill: withAlpha(getCSS("--yellow"), 0.085), cls: "" };
    if (inRedHome) return { fill: withAlpha(getCSS("--red"), 0.085), cls: "" };
    if (inBlueHome) return { fill: withAlpha(getCSS("--blue"), 0.085), cls: "" };

    // home stretch coloring
    if (isHomeStretch) {
      const col = COLORS.find(c => c.id === hs.id)?.hex || "#fff";
      return { fill: withAlpha(col, 0.20), cls: "path" };
    }

    if (isPath) {
      // start squares slightly stronger
      if (SAFE_CELLS.has(k)) {
        const id = startOwnerByCell(k);
        const col = COLORS.find(c => c.id === id)?.hex || "#fff";
        return { fill: withAlpha(col, 0.22), cls: "path" };
      }
      return { fill: pathBg, cls: "path" };
    }

    // void cell
    return { fill: bg, cls: "" };
  }

  const PATH_SET = new Set(PATH.map(p => cellKey(p[0], p[1])));
  const HOME_STRETCH_MAP = (() => {
    const m = new Map();
    for (const c of COLORS) {
      for (const [x,y] of c.homeStretch) {
        m.set(cellKey(x,y), { id: c.id });
      }
    }
    return m;
  })();

  function startOwnerByCell(k) {
    for (const c of COLORS) {
      const si = START_INDEX[c.id];
      const kk = cellKey(PATH[si][0], PATH[si][1]);
      if (kk === k) return c.id;
    }
    return null;
  }

  function ensurePawnEls() {
    pawnEls.clear();
    gPieces.innerHTML = "";

    for (const piece of game.pieces) {
      const g = document.createElementNS(svg.namespaceURI, "g");
      g.setAttribute("class", "pawn");
      g.dataset.pieceId = piece.id;

      const ring = document.createElementNS(svg.namespaceURI, "circle");
      ring.setAttribute("class", "ring");
      ring.setAttribute("r", "0.38");
      ring.setAttribute("stroke", withAlpha(colorOf(piece.playerId), 0.85));

      const body = document.createElementNS(svg.namespaceURI, "circle");
      body.setAttribute("class", "body");
      body.setAttribute("r", "0.26");
      body.setAttribute("fill", colorOf(piece.playerId));
      body.setAttribute("stroke", "rgba(255,255,255,.28)");
      body.setAttribute("stroke-width", "0.07");

      const shine = document.createElementNS(svg.namespaceURI, "circle");
      shine.setAttribute("r", "0.10");
      shine.setAttribute("fill", "rgba(255,255,255,.18)");
      shine.setAttribute("cx", "-0.08");
      shine.setAttribute("cy", "-0.08");

      const hit = document.createElementNS(svg.namespaceURI, "circle");
      hit.setAttribute("class", "hit");
      hit.setAttribute("r", "0.55");

      // pointer
      hit.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        const id = g.dataset.pieceId;
        onPickPiece(id);
      });

      g.appendChild(ring);
      g.appendChild(body);
      g.appendChild(shine);
      g.appendChild(hit);
      gPieces.appendChild(g);
      pawnEls.set(piece.id, g);
    }
  }

  function renderPieces() {
    // compute target positions for each piece (with stacking offsets)
    const positions = new Map(); // pieceId -> {x,y}
    const cellBuckets = new Map(); // key -> [pieceIds]

    // 1) base positions per piece
    for (const piece of game.pieces) {
      const base = pieceBasePos(piece);
      positions.set(piece.id, base);

      // key for stacking only if on a board cell (track or homeStretch). For home slots keep separate keys.
      const key = pieceStackKey(piece, base);
      if (!cellBuckets.has(key)) cellBuckets.set(key, []);
      cellBuckets.get(key).push(piece.id);
    }

    // 2) offsets for stacks (max 4)
    for (const [k, ids] of cellBuckets.entries()) {
      if (ids.length <= 1) continue;

      const offs = stackOffsets(ids.length);
      ids.forEach((id, idx) => {
        const p = positions.get(id);
        positions.set(id, { x: p.x + offs[idx].dx, y: p.y + offs[idx].dy });
      });
    }

    // 3) apply to DOM
    for (const piece of game.pieces) {
      const g = pawnEls.get(piece.id);
      if (!g) continue;
      const pos = positions.get(piece.id);
      g.setAttribute("transform", `translate(${pos.x}, ${pos.y})`);

      // movable highlight
      const movable = (game.phase === "needPick" && game.movablePieceIds.includes(piece.id));
      g.classList.toggle("movable", movable);
      g.style.opacity = (piece.state === "finished") ? "0.85" : "1";
    }
  }

  function pieceBasePos(piece) {
    const c = COLORS.find(x => x.id === piece.playerId);

    if (piece.state === "home") {
      const [x,y] = c.homeSlots[piece.n];
      return { x: x + 0.5, y: y + 0.5 };
    }
    if (piece.state === "track") {
      const [x,y] = PATH[piece.trackIndex];
      return { x: x + 0.5, y: y + 0.5 };
    }
    if (piece.state === "homeStretch") {
      const [x,y] = c.homeStretch[piece.stretchIndex];
      return { x: x + 0.5, y: y + 0.5 };
    }
    // finished -> put into finish spot with little stacking per player
    if (piece.state === "finished") {
      const player = game.players.find(p => p.id === piece.playerId);
      const i = (player.finished - 1); // 0..3
      const off = stackOffsets(4)[i];
      return { x: c.finishSpot[0] + off.dx * 0.7, y: c.finishSpot[1] + off.dy * 0.7 };
    }

    return { x: 7.5, y: 7.5 };
  }

  function pieceStackKey(piece, basePos) {
    if (piece.state === "home") return `home:${piece.playerId}:${piece.n}`;
    if (piece.state === "finished") return `fin:${piece.playerId}`;
    // track/homeStretch share by coordinate cell
    const cx = Math.floor(basePos.x);
    const cy = Math.floor(basePos.y);
    return `cell:${cx},${cy}`;
  }

  function stackOffsets(n) {
    // fixed small offsets (cell units)
    const o = 0.18;
    if (n === 2) return [{dx:-o,dy:0},{dx:o,dy:0}];
    if (n === 3) return [{dx:-o,dy:-o/2},{dx:o,dy:-o/2},{dx:0,dy:o}];
    return [{dx:-o,dy:-o},{dx:o,dy:-o},{dx:-o,dy:o},{dx:o,dy:o}];
  }

  // ----- UI Rendering -----
  function renderAll() {
    if (!game) return;

    const cp = currentPlayer();
    elTurnName.textContent = cp.name;
    elTurnDot.style.background = colorOf(cp.id);
    elTurnMeta.textContent = `Kör: ${game.turnIdx + 1}/${game.players.length} • Kész: ${cp.finished}/4`;

    renderScore();
    renderPieces();

    elBtnRoll.disabled = (game.phase !== "needRoll");
    elBtnSkip.disabled = (game.phase === "ended");

    // on needPick, hint shows and pieces highlighted
    if (game.phase === "needPick") {
      updateMovablePieces();
    }
  }

  function renderScore() {
    elScore.innerHTML = "";
    const cols = game.players;
    for (const p of cols) {
      const card = document.createElement("div");
      card.className = "card";
      const left = document.createElement("div");
      left.className = "left";
      const dot = document.createElement("div");
      dot.className = "c-dot";
      dot.style.background = colorOf(p.id);
      const nm = document.createElement("div");
      nm.className = "name";
      nm.textContent = p.name;

      left.appendChild(dot);
      left.appendChild(nm);

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${p.finished}/4`;

      card.appendChild(left);
      card.appendChild(meta);
      elScore.appendChild(card);
    }
    // if 3 players, keep layout nice
    if (game.players.length === 3) {
      const pad = document.createElement("div");
      pad.className = "card";
      pad.style.opacity = "0";
      elScore.appendChild(pad);
    }
  }

  function setHint(msg) {
    elHint.textContent = msg;
  }

  function setDice(face, label) {
    elDiceFace.textContent = face;
    elDiceLabel.textContent = label;
  }

  function logLine(html) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = html;
    elLog.prepend(div);

    // cap
    while (elLog.children.length > 40) elLog.removeChild(elLog.lastChild);
  }

  function logClear() {
    elLog.innerHTML = "";
  }

  // ----- Modals -----
  function openModal(el) {
    el.classList.add("show");
    el.setAttribute("aria-hidden", "false");
  }
  function closeModal(el) {
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
  }

  function openSetup() { openModal(setupModal); }
  function openRules() { openModal(rulesModal); }
  function openWin(player) {
    winText.innerHTML = `<b>${escapeHtml(player.name)}</b> nyert. Ennyi volt, tesó.`;
    openModal(winModal);
  }

  // ----- Setup UI -----
  function buildNameFields() {
    const count = Number(playerCountSel.value);
    const selected = selectPlayers(count);

    nameFields.innerHTML = "";
    for (const c of selected) {
      const row = document.createElement("div");
      row.className = "nameRow";
      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.style.background = c.hex;

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = `${c.label} játékos neve`;
      input.value = defaultNameFor(c.id);
      input.dataset.colorId = c.id;

      row.appendChild(sw);
      row.appendChild(input);
      nameFields.appendChild(row);
    }
  }

  function defaultNameFor(colorId) {
    const map = { green: "Zöld", yellow: "Sárga", red: "Piros", blue: "Kék" };
    return map[colorId] || "Játékos";
  }

  function readSetup() {
    const count = Number(playerCountSel.value);
    const names = {};
    nameFields.querySelectorAll("input[type='text']").forEach(inp => {
      const id = inp.dataset.colorId;
      names[id] = inp.value;
    });

    return {
      count,
      names,
      extraTurnOnSix: !!optExtraTurnOnSix.checked,
      autoMove: !!optAutoMove.checked,
    };
  }

  // ----- Helpers -----
  function cellKey(x, y) { return `${x},${y}`; }

  function colorOf(id) {
    return COLORS.find(c => c.id === id)?.hex || "white";
  }

  function getCSS(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function withAlpha(hex, a) {
    // #RRGGBB -> rgba
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0,2), 16);
    const g = parseInt(h.slice(2,4), 16);
    const b = parseInt(h.slice(4,6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function escapeHtml(s) {
    return (s ?? "").replace(/[&<>"']/g, (m) => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;",
    }[m]));
  }

  // ----- Wire up -----
  elBtnRoll.addEventListener("click", onRoll);
  elBtnSkip.addEventListener("click", onSkip);

  btnRules.addEventListener("click", () => openRules());
  btnNew.addEventListener("click", () => openSetup());

  btnCloseSetup.addEventListener("click", () => closeModal(setupModal));
  setupModal.addEventListener("pointerdown", (e) => { if (e.target === setupModal) closeModal(setupModal); });

  btnCloseRules.addEventListener("click", () => closeModal(rulesModal));
  rulesModal.addEventListener("pointerdown", (e) => { if (e.target === rulesModal) closeModal(rulesModal); });

  btnCloseWin.addEventListener("click", () => closeModal(winModal));
  winModal.addEventListener("pointerdown", (e) => { if (e.target === winModal) closeModal(winModal); });

  btnRestart.addEventListener("click", () => { closeModal(winModal); openSetup(); });

  playerCountSel.addEventListener("change", buildNameFields);

  btnStart.addEventListener("click", () => {
    const cfg = readSetup();
    ui.extraTurnOnSix = cfg.extraTurnOnSix;
    ui.autoMove = cfg.autoMove;

    closeModal(setupModal);
    newGame(cfg);
  });

  // Keyboard convenience (desktop)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      [setupModal, rulesModal, winModal].forEach(closeModal);
    }
    if (e.key === " " || e.key === "Enter") {
      if (game && game.phase === "needRoll") {
        e.preventDefault();
        onRoll();
      }
    }
  });

  // Init
  buildBoard();
  buildNameFields();
  openSetup();

  // When game starts, we need pawns created after game object exists
  const startObserver = new MutationObserver(() => {});
  // Instead: hook into newGame via a small override point
  const _newGame = newGame;
  newGame = (cfg) => {
    _newGame(cfg);
    ensurePawnEls();
    renderAll();
  };

})();
