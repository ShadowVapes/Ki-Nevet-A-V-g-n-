// Canvas rajzolás + kattintás kezelése
window.Board = (() => {
  const COLORS = Rules.COLORS;

  const COLOR_HEX = {
    red:   '#d94a4a',
    green: '#33b36b',
    yellow:'#e6c237',
    blue:  '#3a77ff'
  };

  const COLOR_DARK = {
    red:'#a33232', green:'#1f7e48', yellow:'#b1911f', blue:'#2350b9'
  };

  // saját szín a bal-lent: rotáció fok
  const ROT_DEG = { blue:0, red:-90, green:180, yellow:90 };

  let canvas, ctx;
  let cell = 48;
  let origin = {x:0,y:0};

  // animáció
  let anim = null; // { pieceKey, coords:[{x,y}], t0, stepMs, totalSteps }

  function setup(c){
    canvas = c;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize(){
    // a canvas belső mérete fix (720), a CSS méretez. A cellát a belső alapján számoljuk.
    const w = canvas.width;
    cell = w / 15;
    origin = { x:0, y:0 };
  }

  function clear(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }

  function draw(state, view){
    // view: { myColor, highlights:[{x,y,type}], selectablePieces:Set("color:idx"), selectedPieceKey }
    clear();

    const rot = ROT_DEG[view.myColor] || 0;
    ctx.save();
    applyRotation(rot);

    drawBoardBase();
    drawHomes();
    drawGoalLanes();
    drawTrack();

    if(view.highlights?.length){
      drawHighlights(view.highlights);
    }

    drawPieces(state, view);
    drawCornerLabels(state);

    ctx.restore();

    if(anim){
      // anim alatt folyamatos újrarajzolás
      requestAnimationFrame(()=>draw(state, view));
    }
  }

  function applyRotation(deg){
    if(!deg) return;
    const rad = deg * Math.PI/180;
    const cx = canvas.width/2;
    const cy = canvas.height/2;
    ctx.translate(cx,cy);
    ctx.rotate(rad);
    ctx.translate(-cx,-cy);
  }

  function cellRect(x,y){
    return { x: origin.x + x*cell, y: origin.y + y*cell, w:cell, h:cell };
  }

  function fillCell(x,y,fill,stroke=true){
    const r = cellRect(x,y);
    ctx.fillStyle = fill;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if(stroke){
      ctx.strokeStyle = 'rgba(0,0,0,.10)';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
  }

  function drawBoardBase(){
    // háttér
    ctx.fillStyle = '#e9eef6';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // rács
    ctx.strokeStyle = 'rgba(0,0,0,.07)';
    ctx.lineWidth = 1;
    for(let i=0;i<=15;i++){
      ctx.beginPath();
      ctx.moveTo(i*cell,0); ctx.lineTo(i*cell,canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0,i*cell); ctx.lineTo(canvas.width,i*cell);
      ctx.stroke();
    }

    // közép
    const c = cellRect(6,6);
    ctx.fillStyle = '#0f2036';
    ctx.globalAlpha = 0.12;
    ctx.fillRect(c.x, c.y, cell*3, cell*3);
    ctx.globalAlpha = 1;
  }

  function drawHomes(){
    // home négyzetek 6x6
    drawHomeArea(0,0,'red');
    drawHomeArea(9,0,'green');
    drawHomeArea(9,9,'yellow');
    drawHomeArea(0,9,'blue');

    // közép háromszög dekor
    const cx = 7*cell, cy = 7*cell;
    ctx.save();
    ctx.globalAlpha = 0.95;

    // red triangle
    ctx.fillStyle = COLOR_HEX.red;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.lineTo(6*cell,6*cell);
    ctx.lineTo(6*cell,9*cell);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = COLOR_HEX.green;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.lineTo(6*cell,6*cell);
    ctx.lineTo(9*cell,6*cell);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = COLOR_HEX.yellow;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.lineTo(9*cell,6*cell);
    ctx.lineTo(9*cell,9*cell);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = COLOR_HEX.blue;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.lineTo(6*cell,9*cell);
    ctx.lineTo(9*cell,9*cell);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawHomeArea(x0,y0,color){
    for(let y=y0;y<y0+6;y++){
      for(let x=x0;x<x0+6;x++){
        fillCell(x,y, COLOR_HEX[color]);
      }
    }

    // belső fehér négyzet
    for(let y=y0+1;y<y0+5;y++){
      for(let x=x0+1;x<x0+5;x++){
        fillCell(x,y, '#f8fbff');
      }
    }

    // home pöttyök (4)
    const dots = homeSlots(color);
    for(const [cx,cy] of dots){
      drawDiscAtCellCenter(cx,cy,'rgba(0,0,0,.18)', cell*0.18);
    }
  }

  function homeSlots(color){
    // a 2x2 spotok cella koordinátái
    if(color==='red') return [[2,2],[4,2],[2,4],[4,4]];
    if(color==='green') return [[10,2],[12,2],[10,4],[12,4]];
    if(color==='yellow') return [[10,10],[12,10],[10,12],[12,12]];
    return [[2,10],[4,10],[2,12],[4,12]]; // blue
  }

  function drawGoalLanes(){
    for(const c of COLORS){
      const lane = Rules.GOAL[c];
      for(let i=0;i<lane.length;i++){
        const [x,y]=lane[i];
        fillCell(x,y, (i===lane.length-1) ? COLOR_DARK[c] : COLOR_HEX[c]);
      }
    }

    // finish cell
    fillCell(7,7,'#0f2036');
  }

  function drawTrack(){
    for(let i=0;i<Rules.TRACK.length;i++){
      const [x,y] = Rules.TRACK[i];
      fillCell(x,y,'#ffffff');

      // star
      if(Rules.STAR_INDEX.has(i)){
        drawStarAtCell(x,y,'rgba(0,0,0,.25)');
      }

      // start squares color tint
      const owner = Rules.isStartSquareGlobalIndex(i);
      if(owner){
        ctx.save();
        ctx.globalAlpha = 0.85;
        fillCell(x,y, COLOR_HEX[owner]);
        ctx.restore();
      }
    }
  }

  function drawHighlights(list){
    ctx.save();
    for(const h of list){
      const r = cellRect(h.x,h.y);
      if(h.type==='target'){
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.lineWidth = 3;
        ctx.strokeRect(r.x+3,r.y+3,r.w-6,r.h-6);
      } else if(h.type==='piece'){
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 4;
        ctx.strokeRect(r.x+4,r.y+4,r.w-8,r.h-8);
      }
    }
    ctx.restore();
  }

  function drawPieces(state, view){
    if(!state?.pieces) return;

    // helyek -> lista
    const placements = new Map(); // key "x,y" -> [{color,pi,progress}]

    for(const c of COLORS){
      for(let i=0;i<4;i++){
        const p = state.pieces[c][i];
        let coord;
        if(p.progress === -1){
          coord = homeSlots(c)[i];
        } else {
          coord = Rules.progressToCoord(c, p.progress);
        }
        if(!coord) continue;
        const k = coord[0]+','+coord[1];
        if(!placements.has(k)) placements.set(k,[]);
        placements.get(k).push({color:c, pieceIndex:i, progress:p.progress});
      }
    }

    // anim override: ha anim fut, az adott bábu koordinátáját interpoláljuk
    let animPos = null;
    if(anim){
      const t = performance.now();
      const dt = t - anim.t0;
      const step = Math.floor(dt / anim.stepMs);
      const within = (dt % anim.stepMs) / anim.stepMs;

      if(step >= anim.coords.length-1){
        anim = null;
      } else {
        const a = anim.coords[step];
        const b = anim.coords[step+1];
        animPos = {
          pieceKey: anim.pieceKey,
          x: a.x + (b.x-a.x)*within,
          y: a.y + (b.y-a.y)*within
        };
      }
    }

    for(const [k, arr] of placements.entries()){
      const [sx,sy] = k.split(',').map(Number);
      // ha anim bábu ide tartozik, később rajzoljuk

      const n = arr.length;
      for(let j=0;j<n;j++){
        const it = arr[j];
        const pieceKey = it.color+':'+it.pieceIndex;
        if(animPos && animPos.pieceKey===pieceKey) continue;

        const pos = stackedOffset(sx,sy,n,j);
        drawPawn(pos.x,pos.y,it.color, view.selectablePieces?.has(pieceKey), view.selectedPieceKey===pieceKey);
      }
    }

    if(animPos){
      // animált bábu
      // animPos x,y cella koordinátában (float)
      const px = origin.x + (animPos.x+0.5)*cell;
      const py = origin.y + (animPos.y+0.5)*cell;
      const [c, idx] = animPos.pieceKey.split(':');
      drawPawnAt(px,py,c, false, true);
    }
  }

  function stackedOffset(x,y,n,i){
    const baseX = origin.x + (x+0.5)*cell;
    const baseY = origin.y + (y+0.5)*cell;
    if(n===1) return {x:baseX,y:baseY};

    const r = cell*0.18;
    const offsets = [
      [-r,-r],[r,-r],[-r,r],[r,r]
    ];
    const o = offsets[i%4];
    return { x: baseX + o[0], y: baseY + o[1] };
  }

  function drawPawn(cellCenterX, cellCenterY, color, selectable, selected){
    drawPawnAt(cellCenterX, cellCenterY, color, selectable, selected);
  }

  function drawPawnAt(cx,cy,color,selectable,selected){
    const r = cell*0.26;

    // body
    ctx.save();
    ctx.fillStyle = COLOR_DARK[color];
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = COLOR_HEX[color];
    ctx.beginPath();
    ctx.arc(cx, cy - r*0.25, r*0.85, 0, Math.PI*2);
    ctx.fill();

    // highlight ring
    if(selectable){
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r+5, 0, Math.PI*2);
      ctx.stroke();
    }

    if(selected){
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r+8, 0, Math.PI*2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawDiscAtCellCenter(x,y,fill,rad){
    const cx = origin.x + (x+0.5)*cell;
    const cy = origin.y + (y+0.5)*cell;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx,cy,rad,0,Math.PI*2);
    ctx.fill();
  }

  function drawStarAtCell(x,y,fill){
    const cx = origin.x + (x+0.5)*cell;
    const cy = origin.y + (y+0.5)*cell;
    const spikes = 5;
    const outer = cell*0.22;
    const inner = cell*0.11;
    let rot = Math.PI / 2 * 3;
    let step = Math.PI / spikes;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - outer);
    for(let i=0;i<spikes;i++){
      ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
      rot += step;
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  function drawCornerLabels(state){
    if(!state.players?.length) return;

    // feliratok a home mezőkben (counter-rotate nélkül, a rotációval együtt megy)
    const map = {
      red:   { x: 0.5, y: 0.55 },
      green: { x: 14.5, y: 0.55 },
      yellow:{ x: 14.5, y: 14.6 },
      blue:  { x: 0.5, y: 14.6 }
    };

    ctx.save();
    ctx.font = `${Math.floor(cell*0.35)}px system-ui`;
    ctx.textBaseline = 'middle';

    for(const p of state.players){
      const a = map[p.color];
      if(!a) continue;
      const cx = origin.x + a.x*cell;
      const cy = origin.y + a.y*cell;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillText(p.name, cx, cy);
    }

    ctx.restore();
  }

  function screenToBoardCell(clientX, clientY, myColor){
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);

    // inverse rotate
    const deg = ROT_DEG[myColor] || 0;
    if(deg){
      const rad = -deg * Math.PI/180;
      const cx = canvas.width/2;
      const cy = canvas.height/2;
      const dx = px - cx;
      const dy = py - cy;
      const rx = dx*Math.cos(rad) - dy*Math.sin(rad);
      const ry = dx*Math.sin(rad) + dy*Math.cos(rad);
      const ux = rx + cx;
      const uy = ry + cy;
      return { x: Math.floor(ux / cell), y: Math.floor(uy / cell) };
    }

    return { x: Math.floor(px / cell), y: Math.floor(py / cell) };
  }

  function startMoveAnimation(color, pieceIndex, fromProgress, path){
    // path: progress lista, fromProgress: kezdő
    const coords = [];

    // from
    const fromCoord = (fromProgress === -1)
      ? homeSlots(color)[pieceIndex]
      : Rules.progressToCoord(color, fromProgress);

    if(!fromCoord) return;

    coords.push({ x: fromCoord[0], y: fromCoord[1] });

    for(const pr of path){
      const c = Rules.progressToCoord(color, pr);
      if(c) coords.push({ x:c[0], y:c[1] });
    }

    anim = {
      pieceKey: `${color}:${pieceIndex}`,
      coords,
      t0: performance.now(),
      stepMs: 170
    };
  }

  return {
    setup,
    draw,
    screenToBoardCell,
    startMoveAnimation,
    COLOR_HEX
  };
})();
