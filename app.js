// Supabase inicializálás - IDE ÍRD BE A SAJÁT ADATAIDAT!
const SUPABASE_URL = 'https://your-project.supabase.co';  // CSAK EZT KELL MÓDOSÍTANI
const SUPABASE_ANON_KEY = 'your-anon-key';  // CSAK EZT KELL MÓDOSÍTANI

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Game constants
const COLORS = {
    red: { id: 'red', name: 'Piros', bg: 'bg-red-500', light: 'bg-red-400', dark: 'bg-red-800', text: 'text-white', border: 'border-red-500' },
    blue: { id: 'blue', name: 'Kék', bg: 'bg-blue-500', light: 'bg-blue-400', dark: 'bg-blue-800', text: 'text-white', border: 'border-blue-500' },
    green: { id: 'green', name: 'Zöld', bg: 'bg-green-500', light: 'bg-green-400', dark: 'bg-green-800', text: 'text-white', border: 'border-green-500' },
    yellow: { id: 'yellow', name: 'Sárga', bg: 'bg-yellow-500', light: 'bg-yellow-400', dark: 'bg-yellow-800', text: 'text-white', border: 'border-yellow-500' }
};

// Generate board layout
function generateBoard() {
    const board = Array(15).fill().map(() => Array(15).fill({ type: 'normal' }));
    
    // Safe cells (stars)
    const safeCells = [
        {x: 1, y: 6}, {x: 6, y: 1}, {x: 8, y: 1}, {x: 13, y: 6},
        {x: 1, y: 8}, {x: 6, y: 13}, {x: 8, y: 13}, {x: 13, y: 8},
        {x: 6, y: 6}, {x: 6, y: 8}, {x: 8, y: 6}, {x: 8, y: 8}
    ];
    
    safeCells.forEach(({x, y}) => {
        board[y][x] = { type: 'safe', color: 'gray' };
    });
    
    // Home areas
    const homeAreas = [
        { color: 'red', startX: 12, startY: 12, endX: 14, endY: 14 },
        { color: 'blue', startX: 0, startY: 0, endX: 2, endY: 2 },
        { color: 'green', startX: 0, startY: 12, endX: 2, endY: 14 },
        { color: 'yellow', startX: 12, startY: 0, endX: 14, endY: 2 }
    ];
    
    homeAreas.forEach(area => {
        for (let y = area.startY; y <= area.endY; y++) {
            for (let x = area.startX; x <= area.endX; x++) {
                board[y][x] = { type: 'home', color: area.color };
            }
        }
    });
    
    // Start positions
    board[13][6] = { type: 'start', color: 'red' };
    board[1][8] = { type: 'start', color: 'blue' };
    board[6][1] = { type: 'start', color: 'green' };
    board[8][13] = { type: 'start', color: 'yellow' };
    
    // Path cells
    const paths = [
        {color: 'red', cells: [{x:6,y:12},{x:6,y:11},{x:6,y:10},{x:6,y:9}]},
        {color: 'blue', cells: [{x:8,y:2},{x:8,y:3},{x:8,y:4},{x:8,y:5}]},
        {color: 'green', cells: [{x:2,y:8},{x:3,y:8},{x:4,y:8},{x:5,y:8}]},
        {color: 'yellow', cells: [{x:12,y:8},{x:11,y:8},{x:10,y:8},{x:9,y:8}]}
    ];
    
    paths.forEach(path => {
        path.cells.forEach(cell => {
            if (board[cell.y][cell.x].type === 'normal') {
                board[cell.y][cell.x] = { type: 'path', color: path.color };
            }
        });
    });
    
    return board;
}

// Generate unique ID
function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Create initial pieces
function createInitialPieces(color) {
    return [
        { id: generateId(), position: 'base', x: null, y: null, color, index: 0 },
        { id: generateId(), position: 'base', x: null, y: null, color, index: 1 },
        { id: generateId(), position: 'base', x: null, y: null, color, index: 2 },
        { id: generateId(), position: 'base', x: null, y: null, color, index: 3 }
    ];
}

// Get pieces at position
function getPiecesAtPosition(players, x, y) {
    return players.flatMap(player => 
        player.pieces.filter(piece => 
            piece.position === 'path' && piece.x === x && piece.y === y
        ).map(piece => ({
            ...piece,
            playerId: player.id,
            playerName: player.name,
            playerColor: player.color
        }))
    );
}

// Main App
class LudoApp {
    constructor() {
        this.user = null;
        this.room = null;
        this.player = null;
        this.players = [];
        this.board = generateBoard();
        this.state = 'loading';
        this.init();
    }

    async init() {
        try {
            // Anonymous login
            const { data, error } = await supabase.auth.signInAnonymously();
            if (error) throw error;
            this.user = data.user;

            // Check for saved game
            const savedRoom = localStorage.getItem('ludo_room');
            const savedPlayer = localStorage.getItem('ludo_player');
            
            if (savedRoom && savedPlayer) {
                this.room = JSON.parse(savedRoom);
                this.player = JSON.parse(savedPlayer);
                this.subscribeToRoom();
                this.fetchPlayers();
                this.state = this.room.status === 'playing' ? 'game' : 'room';
            } else {
                this.state = 'lobby';
            }
        } catch (error) {
            console.error('Init error:', error);
            this.state = 'lobby';
        }
        this.render();
    }

    async subscribeToRoom() {
        if (!this.room) return;
        
        // Room updates
        supabase.channel(`room-${this.room.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'rooms',
                filter: `id=eq.${this.room.id}`
            }, (payload) => {
                this.room = payload.new;
                if (this.room.status === 'finished') {
                    this.showWinner();
                }
                this.render();
            })
            .subscribe();

        // Player updates
        supabase.channel(`players-${this.room.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'players',
                filter: `room_id=eq.${this.room.id}`
            }, () => {
                this.fetchPlayers();
            })
            .subscribe();
    }

    async fetchPlayers() {
        if (!this.room) return;
        const { data } = await supabase
            .from('players')
            .select('*')
            .eq('room_id', this.room.id)
            .order('turn_order');
        this.players = data || [];
        this.render();
    }

    async createRoom(playerName) {
        try {
            const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            const { data: room, error: roomError } = await supabase
                .from('rooms')
                .insert({
                    code: roomCode,
                    host_id: this.user.id,
                    current_player_id: this.user.id
                })
                .select()
                .single();

            if (roomError) throw roomError;

            const { data: player, error: playerError } = await supabase
                .from('players')
                .insert({
                    room_id: room.id,
                    user_id: this.user.id,
                    name: playerName,
                    color: 'red',
                    turn_order: 0,
                    pieces: createInitialPieces('red'),
                    is_host: true
                })
                .select()
                .single();

            if (playerError) throw playerError;

            this.room = room;
            this.player = player;
            this.state = 'room';
            localStorage.setItem('ludo_room', JSON.stringify(room));
            localStorage.setItem('ludo_player', JSON.stringify(player));
            this.subscribeToRoom();
            this.fetchPlayers();
        } catch (error) {
            alert('Hiba a szoba létrehozásakor: ' + error.message);
        }
    }

    async joinRoom(roomCode, playerName) {
        try {
            const { data: room, error: roomError } = await supabase
                .from('rooms')
                .select('*')
                .eq('code', roomCode.toUpperCase())
                .eq('status', 'waiting')
                .single();

            if (roomError) throw new Error('Nem található ilyen szoba, vagy már elkezdődött a játék');

            const { data: existingPlayers } = await supabase
                .from('players')
                .select('color')
                .eq('room_id', room.id);

            if (existingPlayers.length >= 4) {
                throw new Error('A szoba már tele van');
            }

            const colors = ['red', 'blue', 'green', 'yellow'];
            const takenColors = existingPlayers.map(p => p.color);
            const availableColor = colors.find(c => !takenColors.includes(c)) || colors[0];

            const { data: player, error: playerError } = await supabase
                .from('players')
                .insert({
                    room_id: room.id,
                    user_id: this.user.id,
                    name: playerName,
                    color: availableColor,
                    turn_order: existingPlayers.length,
                    pieces: createInitialPieces(availableColor),
                    is_host: false
                })
                .select()
                .single();

            if (playerError) throw playerError;

            this.room = room;
            this.player = player;
            this.state = 'room';
            localStorage.setItem('ludo_room', JSON.stringify(room));
            localStorage.setItem('ludo_player', JSON.stringify(player));
            this.subscribeToRoom();
            this.fetchPlayers();
        } catch (error) {
            alert('Hiba a csatlakozáskor: ' + error.message);
        }
    }

    async startGame() {
        if (this.players.length < 2) {
            alert('Legalább 2 játékos szükséges!');
            return;
        }

        if (!this.player.is_host) {
            alert('Csak a házigazda indíthatja a játékot!');
            return;
        }

        try {
            const { error } = await supabase
                .from('rooms')
                .update({
                    status: 'playing',
                    current_player_id: this.players[0].id
                })
                .eq('id', this.room.id);

            if (error) throw error;
            
            this.state = 'game';
            this.render();
        } catch (error) {
            alert('Hiba a játék indításakor: ' + error.message);
        }
    }

    async rollDice() {
        if (this.room.dice_rolling || this.room.current_player_id !== this.player.id) return;

        await supabase
            .from('rooms')
            .update({ dice_rolling: true, dice_value: 0 })
            .eq('id', this.room.id);

        setTimeout(async () => {
            const diceValue = Math.floor(Math.random() * 6) + 1;
            await supabase
                .from('rooms')
                .update({
                    dice_value: diceValue,
                    dice_rolling: false
                })
                .eq('id', this.room.id);
        }, 1000);
    }

    async leaveRoom() {
        if (this.player) {
            await supabase
                .from('players')
                .delete()
                .eq('id', this.player.id);
            
            if (this.player.is_host) {
                const { data: remainingPlayers } = await supabase
                    .from('players')
                    .select('id')
                    .eq('room_id', this.room.id);
                
                if (!remainingPlayers || remainingPlayers.length === 0) {
                    await supabase
                        .from('rooms')
                        .delete()
                        .eq('id', this.room.id);
                }
            }
        }

        localStorage.removeItem('ludo_room');
        localStorage.removeItem('ludo_player');
        this.room = null;
        this.player = null;
        this.players = [];
        this.state = 'lobby';
        this.render();
    }

    showWinner() {
        if (this.room.winner) {
            const winner = this.players.find(p => p.id === this.room.winner);
            if (winner) {
                alert(`${winner.name} nyerte a játékot!`);
            }
        }
    }

    render() {
        const app = document.getElementById('app');
        if (!app) return;

        if (this.state === 'loading') {
            app.innerHTML = `
                <div class="min-h-screen flex items-center justify-center">
                    <div class="text-center">
                        <div class="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                        <p class="text-gray-300">Játék betöltése...</p>
                    </div>
                </div>
            `;
            return;
        }

        if (this.state === 'lobby') {
            app.innerHTML = this.renderLobby();
            this.setupLobbyListeners();
        } else if (this.state === 'room') {
            app.innerHTML = this.renderRoom();
            this.setupRoomListeners();
        } else if (this.state === 'game') {
            app.innerHTML = this.renderGame();
            this.setupGameListeners();
        }
    }

    renderLobby() {
        return `
            <div class="min-h-screen flex flex-col items-center justify-center p-4">
                <div class="text-center mb-12">
                    <h1 class="text-5xl font-bold mb-4" style="background: linear-gradient(to right, #facc15, #dc2626, #2563eb); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                        Ki nevet a végén?
                    </h1>
                    <p class="text-gray-300 text-lg">A klasszikus Ludo játék online változata</p>
                </div>

                <div class="flex flex-col gap-6 max-w-md w-full">
                    <button id="createBtn" class="bg-gradient-to-r from-green-500 to-emerald-600 p-6 rounded-2xl shadow-2xl hover:scale-105 transition-all">
                        <div class="text-center">
                            <i class="fas fa-plus-circle text-3xl mb-3"></i>
                            <h2 class="text-2xl font-bold mb-2">Szoba létrehozása</h2>
                            <p class="text-gray-200">Hozz létre egy új játékot</p>
                        </div>
                    </button>

                    <button id="joinBtn" class="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-2xl shadow-2xl hover:scale-105 transition-all">
                        <div class="text-center">
                            <i class="fas fa-sign-in-alt text-3xl mb-3"></i>
                            <h2 class="text-2xl font-bold mb-2">Csatlakozás szobához</h2>
                            <p class="text-gray-200">Csatlakozz egy meglévő szobához</p>
                        </div>
                    </button>
                </div>

                <div class="mt-12 text-gray-400 text-sm text-center">
                    <p><i class="fas fa-info-circle mr-2"></i>Minimum 2 játékos szükséges</p>
                    <p><i class="fas fa-info-circle mr-2"></i>Maximum 4 játékos játszhat</p>
                </div>
            </div>
        `;
    }

    renderRoom() {
        return `
            <div class="min-h-screen flex flex-col items-center justify-center p-4">
                <div class="w-full max-w-2xl">
                    <div class="bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-700">
                        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h1 class="text-3xl font-bold mb-2">Várakozó szoba</h1>
                                <div class="flex items-center space-x-4">
                                    <div class="flex items-center">
                                        <i class="fas fa-users mr-2 text-gray-400"></i>
                                        <span class="text-gray-300">${this.players.length}/4 játékos</span>
                                    </div>
                                    <div class="flex items-center">
                                        <i class="fas fa-key mr-2 text-gray-400"></i>
                                        <span class="text-gray-300 font-mono">Kód: ${this.room.code}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="flex space-x-3">
                                <button id="copyBtn" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-all">
                                    <i class="fas fa-copy mr-2"></i>Kód másolása
                                </button>
                                
                                <button id="leaveBtn" class="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition-all">
                                    <i class="fas fa-sign-out-alt mr-2"></i>Kilépés
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        ${this.players.map((p, index) => `
                            <div class="p-4 rounded-xl border-2 ${p.id === this.player.id ? 'border-yellow-500' : 'border-gray-700'} ${COLORS[p.color].bg}">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center">
                                        <div class="w-10 h-10 rounded-full ${COLORS[p.color].light} flex items-center justify-center mr-3">
                                            <i class="fas fa-user text-white"></i>
                                        </div>
                                        <div>
                                            <div class="flex items-center">
                                                <span class="font-bold text-lg">${p.name}</span>
                                                ${p.is_host ? '<span class="ml-2 px-2 py-1 bg-yellow-500 text-white text-xs rounded-full">Házigazda</span>' : ''}
                                            </div>
                                            <div class="flex items-center text-sm">
                                                <span class="px-2 py-1 rounded ${COLORS[p.color].dark} ${COLORS[p.color].text}">
                                                    ${COLORS[p.color].name}
                                                </span>
                                                <span class="ml-2 text-gray-300">#${index + 1}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    ${p.id === this.player.id ? '<span class="px-3 py-1 bg-yellow-800 text-yellow-200 text-sm rounded-full">Te</span>' : ''}
                                </div>
                                
                                <div class="mt-4 flex space-x-2">
                                    ${[0,1,2,3].map(i => `
                                        <div class="w-8 h-8 rounded-full ${COLORS[p.color].light} border-2 ${COLORS[p.color].border} flex items-center justify-center">
                                            ${p.pieces[i]?.position === 'base' ? '<i class="fas fa-home text-xs text-white"></i>' : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                        
                        ${Array.from({ length: 4 - this.players.length }).map((_, i) => `
                            <div class="p-4 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center">
                                <div class="text-center text-gray-500">
                                    <i class="fas fa-user-plus text-2xl mb-2"></i>
                                    <p>Üres hely</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    ${this.player.is_host ? `
                        <div class="text-center">
                            <button id="startBtn" class="px-8 py-4 rounded-xl text-xl font-bold ${this.players.length < 2 ? 'bg-gray-700 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'} transition-all">
                                <i class="fas fa-play mr-3"></i>
                                ${this.players.length < 2 ? 'Várj még játékosokat (min. 2)' : 'Játék indítása'}
                            </button>
                            ${this.players.length < 2 && `
                                <p class="text-gray-400 mt-3">
                                    <i class="fas fa-info-circle mr-2"></i>
                                    Legalább 2 játékos szükséges a játék indításához
                                </p>
                            `}
                        </div>
                    ` : `
                        <div class="text-center text-gray-400">
                            <i class="fas fa-hourglass-half text-2xl mb-3"></i>
                            <p>Várj a házigazdára, hogy indítsa a játékot...</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    renderGame() {
        const currentPlayer = this.players.find(p => p.id === this.room.current_player_id);
        const isMyTurn = currentPlayer?.id === this.player.id;
        
        return `
            <div class="min-h-screen flex flex-col p-4">
                <!-- Game Header -->
                <div class="flex flex-col md:flex-row justify-between items-center mb-6">
                    <div class="mb-4 md:mb-0">
                        <h1 class="text-2xl font-bold">Ludo - ${this.room.code}</h1>
                        <div class="flex items-center space-x-4 mt-2">
                            <span class="text-gray-400">
                                <i class="fas fa-users mr-1"></i> ${this.players.length} játékos
                            </span>
                            <button id="gameLeaveBtn" class="text-red-400 hover:text-red-300 transition-all">
                                <i class="fas fa-sign-out-alt mr-1"></i>Kilépés
                            </button>
                        </div>
                    </div>
                    
                    ${currentPlayer ? `
                        <div class="px-6 py-3 rounded-full ${COLORS[currentPlayer.color].bg} text-white flex items-center">
                            <div class="w-6 h-6 rounded-full ${COLORS[currentPlayer.color].light} mr-3"></div>
                            <div>
                                <div class="font-bold">${currentPlayer.name} következik</div>
                                <div class="text-sm opacity-90">${isMyTurn ? 'Te vagy soron!' : 'Várj a sorodra'}</div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <div class="flex-1 flex flex-col lg:flex-row gap-6">
                    <!-- Game Board -->
                    <div class="flex-1">
                        <div class="relative bg-gray-800 rounded-2xl p-2 lg:p-4 border-2 border-gray-700">
                            <div class="board-grid">
                                ${this.board.map((row, y) => 
                                    row.map((cell, x) => {
                                        let cellClass = 'cell-normal';
                                        if (cell.type === 'home') cellClass = `cell-home-${cell.color}`;
                                        else if (cell.type === 'safe') cellClass = 'cell-safe';
                                        else if (cell.type === 'path') cellClass = `cell-path-${cell.color}`;
                                        else if (cell.type === 'start') cellClass = `cell-path-${cell.color}`;
                                        
                                        const piecesHere = getPiecesAtPosition(this.players, x, y);
                                        
                                        return `
                                            <div class="cell ${cellClass} relative flex items-center justify-center">
                                                ${cell.type === 'safe' ? '<i class="fas fa-star text-yellow-400 text-xs"></i>' : ''}
                                                ${piecesHere.map((piece, index) => {
                                                    const total = piecesHere.length;
                                                    const angle = (index / total) * 2 * Math.PI;
                                                    const radius = total > 1 ? 6 : 0;
                                                    const offsetX = Math.cos(angle) * radius;
                                                    const offsetY = Math.sin(angle) * radius;
                                                    
                                                    return `
                                                        <div class="absolute" style="transform: translate(${offsetX}px, ${offsetY}px); z-index: ${10 + index};">
                                                            <div class="piece piece-small ${COLORS[piece.color].light} border-2 ${COLORS[piece.color].border}">
                                                                ${piece.index + 1}
                                                            </div>
                                                        </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        `;
                                    }).join('')
                                ).join('')}
                            </div>

                            <!-- Dice in Center -->
                            <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
                                <button id="diceBtn" class="w-20 h-20 flex items-center justify-center text-3xl font-bold rounded-xl border-4 ${currentPlayer ? COLORS[currentPlayer.color].border : 'border-gray-700'} bg-white text-black ${this.room.dice_rolling ? 'animate-pulse' : ''} ${!isMyTurn || this.room.dice_rolling ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'} transition-all">
                                    ${this.room.dice_value || '🎲'}
                                </button>
                                
                                ${currentPlayer && `
                                    <div class="text-center mt-2">
                                        <span class="px-3 py-1 rounded-full ${COLORS[currentPlayer.color].bg} text-white">
                                            ${currentPlayer.name}
                                        </span>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>

                    <!-- Player Sidebar -->
                    <div class="md:w-80 space-y-4">
                        ${this.players.map(p => `
                            <div class="p-4 rounded-xl border-2 ${p.id === currentPlayer?.id ? 'border-yellow-500' : 'border-gray-700'} ${p.id === this.player.id ? 'ring-2 ring-blue-500' : ''} ${COLORS[p.color].bg}">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="flex items-center">
                                        <div class="w-10 h-10 rounded-full ${COLORS[p.color].light} flex items-center justify-center mr-3">
                                            ${p.id === this.player.id ? '<i class="fas fa-user text-white"></i>' : ''}
                                        </div>
                                        <div>
                                            <div class="font-bold">${p.name}</div>
                                            <div class="text-sm opacity-90">${COLORS[p.color].name}</div>
                                        </div>
                                    </div>
                                    
                                    ${p.id === currentPlayer?.id ? `
                                        <div class="px-3 py-1 bg-yellow-500 text-white text-sm rounded-full animate-pulse">
                                            <i class="fas fa-play mr-1"></i>Soron
                                        </div>
                                    ` : ''}
                                </div>
                                
                                <div class="grid grid-cols-4 gap-2">
                                    ${p.pieces.map(piece => {
                                        let status = '';
                                        let icon = '';
                                        
                                        if (piece.position === 'base') {
                                            status = 'Bázis';
                                            icon = 'fa-home';
                                        } else if (piece.position === 'home') {
                                            status = 'Célban';
                                            icon = 'fa-flag-checkered';
                                        } else {
                                            status = 'Pályán';
                                            icon = 'fa-walking';
                                        }
                                        
                                        return `
                                            <div class="p-2 rounded-lg text-center bg-black/20">
                                                <div class="w-8 h-8 rounded-full ${COLORS[p.color].light} mx-auto mb-1 flex items-center justify-center">
                                                    <i class="fas ${icon} text-xs text-white"></i>
                                                </div>
                                                <div class="text-xs text-white">${status}</div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                                
                                <div class="mt-3 text-center text-sm text-white">
                                    ${p.pieces.filter(pc => pc.position === 'home').length}/4 célban
                                </div>
                            </div>
                        `).join('')}
                        
                        <!-- Game Rules -->
                        <div class="p-4 bg-gray-800 rounded-xl border border-gray-700">
                            <h3 class="font-bold mb-2 text-lg"><i class="fas fa-info-circle mr-2"></i>Játékszabályok</h3>
                            <ul class="text-sm text-gray-300 space-y-1">
                                <li>• 6-os dobással lehet kilépni</li>
                                <li>• 6-os után újra dobsz</li>
                                <li>• Csak pontos dobással érsz be</li>
                                <li>• Biztonságos mezőn nem lehet leütni</li>
                                <li>• Saját színű mezőn állva védett vagy</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupLobbyListeners() {
        document.getElementById('createBtn')?.addEventListener('click', () => {
            const name = prompt('Add meg a neved:', 'Játékos' + Math.floor(Math.random() * 100));
            if (name && name.trim()) {
                this.createRoom(name.trim());
            }
        });

        document.getElementById('joinBtn')?.addEventListener('click', () => {
            const name = prompt('Add meg a neved:', 'Játékos' + Math.floor(Math.random() * 100));
            const code = prompt('Add meg a szoba kódját (6 karakter):');
            if (name && name.trim() && code && code.trim()) {
                this.joinRoom(code.trim(), name.trim());
            }
        });
    }

    setupRoomListeners() {
        document.getElementById('copyBtn')?.addEventListener('click', () => {
            navigator.clipboard.writeText(this.room.code);
            alert('Kód másolva a vágólapra!');
        });

        document.getElementById('leaveBtn')?.addEventListener('click', () => {
            if (confirm('Biztosan ki akarsz lépni a szobából?')) {
                this.leaveRoom();
            }
        });

        document.getElementById('startBtn')?.addEventListener('click', () => {
            this.startGame();
        });
    }

    setupGameListeners() {
        document.getElementById('gameLeaveBtn')?.addEventListener('click', () => {
            if (confirm('Biztosan ki akarsz lépni a játékból?')) {
                this.leaveRoom();
            }
        });

        const diceBtn = document.getElementById('diceBtn');
        if (diceBtn) {
            const currentPlayer = this.players.find(p => p.id === this.room.current_player_id);
            const isMyTurn = currentPlayer?.id === this.player.id;
            
            if (isMyTurn && !this.room.dice_rolling) {
                diceBtn.addEventListener('click', () => this.rollDice());
            }
        }
    }
}

// App indítása
document.addEventListener('DOMContentLoaded', () => {
    window.game = new LudoApp();
});
