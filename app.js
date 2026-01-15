// ⛔ IDE ÍRD BE A SAJÁT SUPABASE ADATAID ⛔
  const SUPABASE_URL = "https://tisfsoerdufcbusslymn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_U8iceA_u25OjEaWjHkeGAw_XD99-Id-";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let roomId = "public-room";
let myColor = null;
let game = null;
let rolling = false;

const colors = ["red", "blue", "green", "yellow"];

async function init() {
  const channel = supabase.channel("game")
    .on("broadcast", { event: "state" }, payload => {
      game = payload.payload;
      render();
    })
    .subscribe();

  const { data } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (!data) {
    await supabase.from("rooms").insert({
      id: roomId,
      state: createGame()
    });
    game = createGame();
  } else {
    game = data.state;
  }

  joinGame();
  render();
}

function createGame() {
  return {
    turn: 0,
    dice: 1,
    players: colors.map(c => ({
      color: c,
      pos: 0
    }))
  };
}

function joinGame() {
  for (let p of game.players) {
    if (!p.joined) {
      p.joined = true;
      myColor = p.color;
      break;
    }
  }
  sync();
}

function rollDice() {
  if (rolling) return;
  const current = game.players[game.turn];
  if (current.color !== myColor) return;

  rolling = true;
  let t = 0;
  const interval = setInterval(() => {
    game.dice = Math.floor(Math.random() * 6) + 1;
    document.getElementById("dice").innerText = game.dice;
    t += 100;
    if (t >= 2000) {
      clearInterval(interval);
      movePiece();
    }
  }, 100);
}

function movePiece() {
  const p = game.players[game.turn];
  let steps = game.dice;
  let i = 0;

  const moveInterval = setInterval(() => {
    p.pos++;
    i++;
    render();
    if (i >= steps) {
      clearInterval(moveInterval);
      setTimeout(() => {
        game.turn = (game.turn + 1) % game.players.length;
        rolling = false;
        sync();
      }, 2000);
    }
  }, 300);
}

function sync() {
  supabase.channel("game").send({
    type: "broadcast",
    event: "state",
    payload: game
  });
}

function render() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  game.players.forEach(p => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.style.left = (p.pos % 10) * 8 + "%";
    cell.style.top = Math.floor(p.pos / 10) * 8 + "%";

    const piece = document.createElement("div");
    piece.className = `piece ${p.color}`;

    cell.appendChild(piece);
    board.appendChild(cell);
  });

  const current = game.players[game.turn];
  document.getElementById("player-name").innerText = current.color + " jön";
  document.getElementById("player-indicator").style.background = current.color;
  document.getElementById("dice").style.background = current.color;
}

init();
