window.Util = (() => {
  const now = () => Date.now();
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)));

  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));

  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

  function toast(msg){
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed;left:50%;bottom:72px;transform:translateX(-50%);
      background:rgba(15,32,54,.92);border:1px solid rgba(255,255,255,.15);color:#fff;
      padding:10px 12px;border-radius:12px;box-shadow:0 16px 30px rgba(0,0,0,.35);z-index:9999;max-width:min(92vw,560px);text-align:center`;
    document.body.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .25s'; }, 2200);
    setTimeout(()=>el.remove(), 2550);
  }

  function normRoomCode(code){
    return (code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
  }

  function randRoomCode(){
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s='';
    for(let i=0;i<5;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)];
    return s;
  }

  return { now, uid, clamp, sleep, toast, normRoomCode, randRoomCode };
})();
