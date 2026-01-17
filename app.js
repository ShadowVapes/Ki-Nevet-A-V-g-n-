(() => {
  const { toast, normRoomCode, randRoomCode, uid, now, sleep } = Util;

  // DOM
  const overlay = document.getElementById('overlay');
  const nameInput = document.getElementById('nameInput');
  const roomInput = document.getElementById('roomInput');
  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');
  const roomBadge = document.getElementById('roomBadge');
  const copyRoomBtn = document.getElementById('copyRoomBtn');
  const startBtn = document.getElementById('startBtn');
  const rollBtn = document.getElementById('rollBtn');
  const diceEl = document.getElementById('dice');
  const turnLine = document.getElementById('turnLine');
  const hintLine = document.getElementById('hintLine');

  // Canvas
  const canvas = document.getElementById('board');
  Board.setup(canvas);

  // Local identity
  const playerId = localStorage.getItem('ludo_playerId') || uid();
  localStorage.setItem('ludo_playerId', playerId);

  let playerName = localStorage.getItem('ludo_playerName') || '';
  if(playerName) nameInput.value = playerName;

  // Runtime
  let roomCode = null;
  let isHost = false;
  let myColor = null;
  let roomRow = null; // {code,state,version}

  // UI selection / highlighting
  let selectablePieces = new Set();
  let selectedPieceKey = null;
  let highlights = [];
  let legal = [];

  // Dice animation
  let diceAnim = null; // {nonce, startTs, endTs, value}

  // Init overlay
  overlay.style.display = 'grid';

  createBtn.onclick = async () => {
    const n = (nameInput.value || '').trim();
    if(!n){ toast('Adj meg egy nevet.'); return; }
    playerName = n; localStorage.setItem('ludo_playerName', playerName);

    roomCode = randRoomCode();
    await enterRoom(roomCode);
  };

  joinBtn.onclick = async () => {
    const n = (nameInput.value || '').trim();
    if(!n){ toast('Adj meg egy nevet.'); return; }
    playerName = n; localStorage.setItem('ludo_playerName', playerName);

    const code = normRoomCode(roomInput.value);
    if(!code){ toast('Írj be szoba kódot.'); return; }
    roomCode = code;
    await enterRoom(roomCode);
  };

  copyRoomBtn.onclick = async () => {
    try{
      await navigator.clipboard.writeText(roomCode);
      toast('Kód másolva.');
    } catch {
      toast('Nem sikerült másolni.');
    }
  };

  startBtn.onclick = async () => {
    if(!isHost) return;
    await mutate(async (s) => {
      if(s.status !== 'lobby') return s;
      if((s.players?.length || 0) < 2){
        toast('Minimum 2 játékos kell.');
        return s;
      }
      s.status = 'playing';
      s.startedAt = now();
      s.phase = 'await_roll';
      s.turnIndex = 0;
      s.pieces = Rules.initPieces();
      s.roll = null;
      s.lastMove = null;
      return s;
    });
  };

  rollBtn.onclick = async () => {
    if(!roomRow?.state) return;
    if(!Rules.canRoll(roomRow.state, playerId)) return;

    const nonce = uid();
    const value = Math.floor(Math.random()*6) + 1;
    const startTs = now();

    await mutate(async (s) => {
      if(s.status !== 'playing') return s;
      if(s.phase !== 'await_roll') return s;
      const cur = s.players[s.turnIndex];
      if(!cur || cur.id !== playerId) return s;

      s.phase = 'await_move';
      s.roll = { nonce, by: playerId, startTs, value };
      return s;
    });
  };

  canvas.addEventListener('click', async (ev) => {
    if(!roomRow?.state) return;
    if(roomRow.state.status !== 'playing') return;
    if(!Rules.canMove(roomRow.state, playerId)) return;
    // Dobás animáció alatt ne lehessen lépni / előre jelezni.
    if(diceAnim) return;

    // csak a saját lépésválasztás
    const cell = Board.screenToBoardCell(ev.clientX, ev.clientY, myColor);

    // melyik saját bábu van a cellában?
    const curPlayer = roomRow.state.players[roomRow.state.turnIndex];
    if(!curPlayer) return;

    const color = curPlayer.color;

    // keresünk bábut ebben a cellában
    let picked = null;
    for(let i=0;i<4;i++){
      const p = roomRow.state.pieces[color][i];
      const coord = (p.progress === -1)
        ? homeSlotFor(color, i)
        : Rules.progressToCoord(color, p.progress);
      if(!coord) continue;
      if(coord[0]===cell.x && coord[1]===cell.y){
        const key = `${color}:${i}`;
        if(selectablePieces.has(key)){
          picked = i;
        }
      }
    }

    if(picked == null) return;

    const move = legal.find(m => m.pieceIndex === picked);
    if(!move) return;

    await doMove(move);
  });

  function homeSlotFor(color, i){
    // ugyanaz, mint board.js homeSlots
    if(color==='red') return [[2,2],[4,2],[2,4],[4,4]][i];
    if(color==='green') return [[10,2],[12,2],[10,4],[12,4]][i];
    if(color==='yellow') return [[10,10],[12,10],[10,12],[12,12]][i];
    return [[2,10],[4,10],[2,12],[4,12]][i];
  }

  async function doMove(move){
    const cur = roomRow.state.players[roomRow.state.turnIndex];
    const roll = roomRow.state.roll?.value;
    if(!cur || !roll) return;

    // animáció lokál előre
    Board.startMoveAnimation(cur.color, move.pieceIndex, move.fromProgress, move.path);

    await mutate(async (s) => {
      if(s.status !== 'playing') return s;
      if(s.phase !== 'await_move') return s;
      if(!s.roll || s.roll.by !== playerId) return s;

      const player = s.players[s.turnIndex];
      if(!player || player.id !== playerId) return s;

      // újraszámoljuk legal-t a szerver state-re (biztonság)
      const legalMoves = Rules.legalMoves(s, player);
      const lm = legalMoves.find(m => m.pieceIndex === move.pieceIndex);
      if(!lm) return s;

      const nonce = uid();
      const res = Rules.applyMove(s, player, lm);
      s.lastMove = {
        nonce,
        by: playerId,
        color: player.color,
        pieceIndex: lm.pieceIndex,
        roll: roll,
        fromProgress: res.fromProgress,
        path: lm.path,
        captured: res.captured,
        goalReached: res.goalReached,
        extraTurn: res.extraTurn,
        ts: now()
      };
      return s;
    });
  }

  async function enterRoom(code){
    // URL frissítés
    const u = new URL(window.location.href);
    u.searchParams.set('room', code);
    window.history.replaceState(null,'',u.toString());

    // room létezés / létrehozás
    await ensureRoom(code);

    overlay.style.display = 'none';

    roomBadge.textContent = `KÓD: ${code}`;

    subscribe(code);
    await refreshRoom();

    render();
  }

  async function ensureRoom(code){
    const { data, error } = await sb.from('ludo_rooms').select('code,state,version').eq('code', code).maybeSingle();
    if(error){ toast('Supabase hiba: nem tudtam lekérni a szobát.'); throw error; }

    if(!data){
      // create
      const baseState = {
        status: 'lobby',
        createdAt: now(),
        hostId: playerId,
        players: [],
        startedAt: null,
        phase: 'lobby',
        turnIndex: 0,
        pieces: null,
        roll: null,
        lastMove: null
      };

      const insert = await sb.from('ludo_rooms').insert({ code, state: baseState, version: 1 }).select('code,state,version').single();
      if(insert.error){ toast('Nem tudtam létrehozni a szobát.'); throw insert.error; }
      roomRow = insert.data;
    } else {
      roomRow = data;
    }

    // join
    await mutate(async (s) => {
      const players = s.players || [];

      // ha játék már ment, ne engedjünk belépést játékosként
      if(s.status === 'playing' && !players.find(p=>p.id===playerId)){
        toast('A játék már elindult. Csak nézőként tudsz belépni.');
        return s;
      }

      let me = players.find(p=>p.id===playerId);
      if(!me){
        if(players.length >= 4){
          toast('Tele a szoba (4 játékos).');
          return s;
        }

        // szín kiosztás (szabad szín)
        const used = new Set(players.map(p=>p.color));
        const color = Rules.COLORS.find(c=>!used.has(c));

        players.push({ id: playerId, name: playerName, color, joinedAt: now() });
        s.players = players;
      } else {
        // név frissítés
        me.name = playerName;
      }

      // host ellenőrzés
      if(!s.hostId) s.hostId = players[0]?.id || playerId;
      return s;
    });
  }

  function subscribe(code){
    sb.channel('ludo-room-'+code)
      .on('postgres_changes', { event:'*', schema:'public', table:'ludo_rooms', filter:`code=eq.${code}` }, async (payload) => {
        if(payload.eventType === 'DELETE') return;
        roomRow = payload.new;
        // dice anim handling
        handleDiceAnimation(roomRow.state);
        handleMoveAnimation(roomRow.state);
        render();
      })
      .subscribe();
  }

  async function refreshRoom(){
    const { data, error } = await sb.from('ludo_rooms').select('code,state,version').eq('code', roomCode).single();
    if(error){ toast('Supabase hiba: nem tudtam frissíteni.'); return; }
    roomRow = data;
    handleDiceAnimation(roomRow.state);
    render();
  }

  async function mutate(mutator){
    // CAS: version alapján
    for(let attempt=0; attempt<6; attempt++){
      const { data, error } = await sb.from('ludo_rooms').select('code,state,version').eq('code', roomCode).single();
      if(error){ toast('Supabase hiba.'); return; }

      const next = structuredClone(data.state);
      const updatedState = await mutator(next);

      // ha ugyanaz maradt, akkor is írhatjuk
      const newVersion = (data.version || 0) + 1;
      const upd = await sb.from('ludo_rooms')
        .update({ state: updatedState, version: newVersion })
        .eq('code', roomCode)
        .eq('version', data.version)
        .select('code,state,version')
        .maybeSingle();

      if(!upd.error && upd.data){
        roomRow = upd.data;
        handleDiceAnimation(roomRow.state);
        handleMoveAnimation(roomRow.state);
        return;
      }

      // ütközés, retry
      await sleep(80 + attempt*60);
    }

    toast('Nem sikerült menteni (ütközés). Próbáld újra.');
  }

  function render(){
    if(!roomRow?.state){
      rollBtn.disabled = true;
      return;
    }

    const s = roomRow.state;
    isHost = (s.hostId === playerId);

    document.querySelectorAll('.host-only').forEach(el => {
      el.style.display = isHost ? 'inline-flex' : 'none';
    });

    // find me
    const me = (s.players||[]).find(p=>p.id===playerId);
    myColor = me?.color || 'blue';

    // turn info
    const cur = s.players?.[s.turnIndex];
    if(cur){
      turnLine.textContent = `Következik: ${cur.name} (${cur.color})`;
      diceEl.style.borderColor = Board.COLOR_HEX[cur.color];
    } else {
      turnLine.textContent = '';
    }

    // hint
    if(s.status === 'lobby'){
      hintLine.textContent = isHost
        ? 'Várjátok meg a többieket, majd Start. (2-4 fő)'
        : 'Várakozás… a host indítja.';
    } else if(s.status === 'playing'){
      if(s.phase === 'await_roll'){
        hintLine.textContent = Rules.canRoll(s, playerId) ? 'Te jössz. Dobhatsz.' : 'Várj, más dob.';
      } else if(s.phase === 'await_move'){
        hintLine.textContent = Rules.canMove(s, playerId) ? 'Válassz bábut, vagy auto-lép.' : 'Várj, más lép.';
      }
    }

    // actions
    const canRoll = (s.status==='playing' && Rules.canRoll(s, playerId));
    rollBtn.disabled = !canRoll;

    // compute legal moves + highlights
    selectablePieces = new Set();
    highlights = [];
    selectedPieceKey = null;
    legal = [];

    // Dobás animáció alatt ne jelezzük előre a célmezőket,
    // és ne engedjünk lépésválasztást.
    if(!diceAnim && s.status==='playing' && s.phase==='await_move'){
      const curP = s.players[s.turnIndex];
      if(curP && curP.id === playerId){
        legal = Rules.legalMoves(s, curP);
        for(const m of legal){
          selectablePieces.add(`${curP.color}:${m.pieceIndex}`);
          // target highlight
          const coord = Rules.progressToCoord(curP.color, m.toProgress);
          if(coord) highlights.push({ x: coord[0], y: coord[1], type:'target' });
        }

        // ha nincs lépés: auto skip
        if(legal.length === 0 && !diceAnim){
          autoSkip();
        }

        // ha csak 1: auto move (dobás anim után)
        if(legal.length === 1 && !diceAnim){
          autoMove(legal[0]);
        }
      }
    }

    Board.draw(s, { myColor, highlights, selectablePieces, selectedPieceKey });

    // dice display
    updateDiceFace(s);

    // room badge (host)
    if(isHost){
      roomBadge.textContent = `KÓD: ${roomCode}`;
    }
  }

  async function autoSkip(){
    // nincs lépés -> kör passz
    await mutate(async (s) => {
      if(s.status !== 'playing') return s;
      if(s.phase !== 'await_move') return s;
      const player = s.players[s.turnIndex];
      if(!player || player.id !== playerId) return s;
      // ha nincs legal
      const lm = Rules.legalMoves(s, player);
      if(lm.length !== 0) return s;

      // turn vált
      s.turnIndex = (s.turnIndex + 1) % s.players.length;
      s.phase = 'await_roll';
      s.roll = null;
      return s;
    });
  }

  async function autoMove(move){
    // kis késleltetés, hogy "lássa" a játékos
    await sleep(180);
    if(roomRow?.state?.phase !== 'await_move') return;
    await doMove(move);
  }

  function handleDiceAnimation(s){
    if(!s?.roll) { diceAnim = null; return; }
    if(diceAnim && diceAnim.nonce === s.roll.nonce) return;

    // indítjuk / szinkron
    const startTs = s.roll.startTs;
    const endTs = startTs + 1000;
    diceAnim = { nonce: s.roll.nonce, startTs, endTs, value: s.roll.value };

    animateDice();
  }

  function animateDice(){
    if(!diceAnim || !roomRow?.state?.roll) return;
    const t = now();
    if(t >= diceAnim.endTs){
      diceEl.textContent = String(diceAnim.value);
      diceAnim = null;
      // render frissít, hogy legal move highlight megjelenjen
      render();
      return;
    }

    // random face
    diceEl.textContent = String(Math.floor(Math.random()*6)+1);
    requestAnimationFrame(animateDice);
  }

  function updateDiceFace(s){
    if(s.status !== 'playing'){
      diceEl.textContent = '🎲';
      return;
    }
    if(diceAnim){
      // anim kezeli
      return;
    }
    if(s.roll?.value){
      diceEl.textContent = String(s.roll.value);
    } else {
      diceEl.textContent = '🎲';
    }
  }

  function handleMoveAnimation(s){
    const mv = s?.lastMove;
    if(!mv) return;

    // ha a move friss és a bábu mozgása most történt, animáljuk (mindkét oldalon)
    // Ezt egyszerűen mindig elindítjuk, de ha épp ugyanaz a state már kirajzolta, nem baj.
    Board.startMoveAnimation(mv.color, mv.pieceIndex, mv.fromProgress, mv.path);
  }

  // Auto: ha valaki közvetlen URL-lel jön room parammal
  (async function boot(){
    const params = new URLSearchParams(location.search);
    const r = normRoomCode(params.get('room'));
    if(r){
      roomCode = r;
      if(playerName) nameInput.value = playerName;
      roomInput.value = r;
      // auto join ha van név
      if(playerName){
        await enterRoom(r);
      }
    }
  })();

})();
