// Játékszabály motor (Ludo - Ki nevet a végén)
window.Rules = (() => {
  const COLORS = ['red','green','yellow','blue'];

  // Globális track indexek (52) a 15x15 rácson (x,y cella koordináta)
  // Ezt a Board modul is használja.
  const TRACK = [
    [6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6],
    [1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
    [7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],[14,8],
    [13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],[6,14]
  ];

  const START_COORD = {
    red:   [1,6],
    green: [8,1],
    yellow:[13,8],
    blue:  [6,13]
  };

  // Start indexek a TRACK-ben
  const START_INDEX = Object.fromEntries(COLORS.map(c=>[c, TRACK.findIndex(p=>p[0]===START_COORD[c][0] && p[1]===START_COORD[c][1])]));

  // Safe (ütésmentes) csillag mezők (globális track indexek)
  // Alap Ludo szerint: a 8 "csillag" safe mező + start mezők (kivéve a start mező csak a tulaj színnek safe a kérés szerint)
  const STAR_COORDS = [
    [2,8],[6,2],[12,6],[8,12],
    [6,12],[2,6],[8,2],[12,8]
  ];
  const STAR_INDEX = new Set(STAR_COORDS.map(([x,y]) => TRACK.findIndex(p=>p[0]===x && p[1]===y)).filter(i=>i>=0));

  // Goal lane cellák (progress 52..56), progress 57 = közép
  const GOAL = {
    red:   [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
    green: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
    yellow:[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
    blue:  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]]
  };

  const FINISH = [7,7];

  function initPieces(){
    const pieces = {};
    for(const c of COLORS){
      pieces[c] = [0,1,2,3].map(()=>({ progress:-1 }));
    }
    return pieces;
  }

  // progress -> hely (x,y)
  function progressToCoord(color, progress){
    if(progress < 0) return null;
    if(progress <= 51){
      const gi = (START_INDEX[color] + progress) % 52;
      return TRACK[gi];
    }
    if(progress <= 56){
      return GOAL[color][progress-52];
    }
    if(progress === 57) return FINISH;
    return null;
  }

  function progressToGlobalIndex(color, progress){
    if(progress < 0 || progress > 51) return null;
    return (START_INDEX[color] + progress) % 52;
  }

  function isStar(globalIndex){
    return STAR_INDEX.has(globalIndex);
  }

  function isStartSquareGlobalIndex(globalIndex){
    // melyik szín start mezője ez? (ha az)
    for(const c of COLORS){
      if(START_INDEX[c] === globalIndex) return c;
    }
    return null;
  }

  function isProtectedSquareForVictim(victimColor, victimProgress){
    const gi = progressToGlobalIndex(victimColor, victimProgress);
    if(gi == null) return false; // goal lane vagy home: nem üthető track szabállyal (goal lane alapból safe)
    if(isStar(gi)) return true;
    const startOwner = isStartSquareGlobalIndex(gi);
    if(startOwner && startOwner === victimColor) return true; // a saját start mezőjén safe
    return false;
  }

  function computeMovePath(fromProgress, roll){
    // lépésenkénti progress lista (a cél progress is benne)
    const path = [];
    let cur = fromProgress;
    let dir = +1;
    for(let i=0;i<roll;i++){
      if(cur === 57 && dir === +1){ dir = -1; }
      cur = cur + dir;
      // bounce: progress nem mehet 0 alá, de ez csak finish környékén fordulhat elő; védjük
      if(cur < 0) cur = 0;
      path.push(cur);
    }
    return path;
  }

  function legalMoves(state, player){
    // state.pieces szükséges
    const roll = state.roll?.value;
    if(!roll) return [];
    const color = player.color;
    const pieces = state.pieces[color];

    const moves = [];
    for(let pi=0; pi<pieces.length; pi++){
      const p = pieces[pi];
      const from = p.progress;
      if(from === -1){
        if(roll !== 6) continue;
        // kilépés
        moves.push({ pieceIndex:pi, fromProgress:-1, path:[0], toProgress:0 });
        continue;
      }
      if(from === 57) continue; // kész

      const path = computeMovePath(from, roll);
      const to = path[path.length-1];

      // Goal lane-nél és finish-nél nincs tiltás.
      moves.push({ pieceIndex:pi, fromProgress:from, path, toProgress:to });
    }

    return moves;
  }

  function applyMove(state, player, move){
    // deep clone minimál (state objektumot amúgy is klónozzuk a mutáció előtt)
    const color = player.color;
    const roll = state.roll.value;
    const pieces = state.pieces;

    const p = pieces[color][move.pieceIndex];
    const from = p.progress;

    // léptetés
    p.progress = move.toProgress;

    let captured = [];
    let goalReached = (p.progress === 57);

    // ütés csak a tracken érvényes (progress 0..51)
    if(p.progress >= 0 && p.progress <= 51){
      const destGI = progressToGlobalIndex(color, p.progress);
      const startOwner = isStartSquareGlobalIndex(destGI);
      const star = isStar(destGI);

      if(!star){
        // minden ellenfél bábu, ami ugyan ezen a globális mezőn áll, és nincs védve
        for(const oc of COLORS){
          if(oc === color) continue;
          for(let opi=0; opi<pieces[oc].length; opi++){
            const op = pieces[oc][opi];
            if(op.progress < 0 || op.progress > 51) continue;
            const ogi = progressToGlobalIndex(oc, op.progress);
            if(ogi !== destGI) continue;

            // védelem: saját start mezőjén álló bábu nem üthető
            const victimProtected = (startOwner && startOwner === oc && ogi === START_INDEX[oc]);
            if(victimProtected) continue;

            // egyéb safe: star már kizárt
            // ütés
            op.progress = -1;
            captured.push({ color: oc, pieceIndex: opi });
          }
        }
      }
    }

    const extraTurn = (roll === 6) || (captured.length > 0) || goalReached;

    // de ne stackelődjön: egy mozgás után max 1 extra
    // (boolean így is)

    // turn váltás
    if(extraTurn){
      // ugyanaz a játékos
    } else {
      state.turnIndex = (state.turnIndex + 1) % state.players.length;
    }

    // következő fázis
    state.phase = 'await_roll';
    state.roll = null;

    return { captured, goalReached, extraTurn, fromProgress:from };
  }

  function canRoll(state, playerId){
    const cur = state.players[state.turnIndex];
    if(!cur) return false;
    if(state.phase !== 'await_roll') return false;
    return cur.id === playerId;
  }

  function canMove(state, playerId){
    const cur = state.players[state.turnIndex];
    if(!cur) return false;
    if(state.phase !== 'await_move') return false;
    return cur.id === playerId;
  }

  return {
    COLORS,
    TRACK,
    GOAL,
    FINISH,
    START_INDEX,
    STAR_INDEX,
    initPieces,
    progressToCoord,
    progressToGlobalIndex,
    isStar,
    isStartSquareGlobalIndex,
    isProtectedSquareForVictim,
    computeMovePath,
    legalMoves,
    applyMove,
    canRoll,
    canMove
  };
})();
