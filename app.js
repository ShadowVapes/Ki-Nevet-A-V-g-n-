// Supabase inicializálás
const SUPABASE_URL = prompt('Add meg a Supabase URL-t:') || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = prompt('Add meg a Supabase anon key-et:') || 'your-anon-key';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// React-alapú komponens rendszer
class App extends HTMLElement {
    constructor() {
        super();
        this.user = null;
        this.room = null;
        this.player = null;
        this.players = [];
        this.state = 'loading';
        this.init();
    }

    async init() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                const { data } = await supabase.auth.signInAnonymously();
                this.user = data.user;
            } else {
                this.user = session.user;
            }

            const savedRoom = localStorage.getItem('ludo_room');
            const savedPlayer = localStorage.getItem('ludo_player');
            
            if (savedRoom && savedPlayer) {
                this.room = JSON.parse(savedRoom);
                this.player = JSON.parse(savedPlayer);
                this.state = this.room.status === 'playing' ? 'game' : 'room';
                this.subscribeToRoom();
                this.fetchPlayers();
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
        
        // Subscribe to room changes
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

        // Subscribe to player changes
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
            const { data: room, error: roomError } = await supabase
                .from('rooms')
                .insert({
                    host_id: this.user.id,
                    status: 'waiting',
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

            const colors = ['red', 'blue', 'green', 'yellow'];
            const takenColors = existingPlayers.map(p => p.color);
            const availableColor = colors.find(c => !takenColors.includes(c));
            
            if (!availableColor) throw new Error('A szoba már tele van');

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

            const currentPlayer = this.players.find(p => p.id === this.room.current_player_id);
            if (currentPlayer?.id === this.player.id) {
                const moveable = getMoveablePieces(currentPlayer, diceValue, this.players);
                if (moveable.length === 1) {
                    await this.movePiece(moveable[0], diceValue);
                }
            }
        }, 1000);
    }

    async movePiece(piece, diceValue) {
        const newPos = calculateNewPosition(piece, diceValue);
        const captures = checkCapture(piece, newPos, this.players);
        
        const updatedPieces = this.player.pieces.map(p => 
            p.id === piece.id ? newPos : p
        );

        await supabase
            .from('players')
            .update({ pieces: updatedPieces })
            .eq('id', this.player.id);

        for (const capture of captures) {
            const capturedPlayer = this.players.find(p => p.id === capture.playerId);
            const updatedCapturedPieces = capturedPlayer.pieces.map(p =>
                p.id === capture.pieceId ? { ...p, position: 'base', x: null, y: null } : p
            );
            
            await supabase
                .from('players')
                .update({ pieces: updatedCapturedPieces })
                .eq('id', capture.playerId);
        }

        const extraTurn = diceValue === 6 || captures.length > 0;
        const nextPlayerId = getNextPlayer(this.player.id, this.players, extraTurn);
        
        await supabase
            .from('rooms')
            .update({
                current_player_id: nextPlayerId,
                dice_value: 0
            })
            .eq('id', this.room.id);

        this.fetchPlayers();
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
                
                if (remainingPlayers.length === 0) {
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
        this.innerHTML = '';
        
        if (this.state === 'loading') {
            this.innerHTML = `
                <div class="min-h-screen flex items-center justify-center">
                    <div class="text-center">
                        <div class="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
                        <p class="mt-4 text-gray-300">Betöltés...</p>
                    </div>
                </div>
            `;
            return;
        }

        if (this.state === 'lobby') {
            this.renderLobby();
        } else if (this.state === 'room') {
            this.renderRoom();
        } else if (this.state === 'game') {
            this.renderGame();
        }
    }

    renderLobby() {
        this.innerHTML = `
            <div class="min-h-screen flex flex-col items-center justify-center p-4">
                <div class="text-center mb-12">
                    <h1 class="text-5xl font-bold mb-4" style="background: linear-gradient(to right, #facc15, #dc2626, #2563eb); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                        Ki nevet a végén?
                    </h1>
                    <p class="text-gray-300 text-lg">A klasszikus Ludo játék online változata</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                    <button id="createBtn" class="bg-gradient-to-r from-green-600 to-emerald-700 p-8 rounded-2xl shadow-2xl hover:scale-105 transition-all">
                        <div class="text-center">
                            <i class="fas fa-plus-circle text-4xl mb-4"></i>
                            <h2 class="text-2xl font-bold mb-2">Szoba létrehozása</h2>
                            <p class="text-gray-200">Hozz létre egy új játékot</p>
                        </div>
                    </button>

                    <button id="joinBtn" class="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 rounded-2xl shadow-2xl hover:scale-105 transition-all">
                        <div class="text-center">
                            <i class="fas fa-sign-in-alt text-4xl mb-4"></i>
                            <h2 class="text-2xl font-bold mb-2">Csatlakozás szobához</h2>
                            <p class="text-gray-200">Csatlakozz egy meglévő szobához</p>
                        </div>
                    </button>
                </div>

                <div class="mt-12 text-gray-400 text-sm">
                    <p><i class="fas fa-info-circle mr-2"></i>Minimum 2 játékos szükséges</p>
                    <p><i class="fas fa-info-circle mr-2"></i>Maximum 4 játékos játszhat</p>
                </div>
            </div>
        `;

        this.querySelector('#createBtn').addEventListener('click', () => this.showCreateRoom());
        this.querySelector('#joinBtn').addEventListener('click', () => this.showJoinRoom());
    }

    showCreateRoom() {
        const name = prompt('Add meg a neved:', 'Játékos' + Math.floor(Math.random() * 1000));
        if (name && name.trim()) {
            this.createRoom(name.trim());
        }
    }

    showJoinRoom() {
        const name = prompt('Add meg a neved:', 'Játékos' + Math.floor(Math.random() * 1000));
        const code = prompt('Add meg a szoba kódját:');
        if (name && name.trim() && code && code.trim()) {
            this.joinRoom(code.trim(), name.trim());
        }
    }

    renderRoom() {
        this.innerHTML = `
            <div class="min-h-screen flex flex-col items-center justify-center p-4">
                <div class="w-full max-w-2xl">
                    <div class="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-gray-700">
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
                                
                                <button id="leaveBtn" class="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg transition-all">
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
                                                ${p.is_host ? '<span class="ml-2 px-2 py-1 bg-yellow-600 text-yellow-100 text-xs rounded-full">Házigazda</span>' : ''}
                                            </div>
                                            <div class="flex items-center text-sm">
                                                <span class="px-2 py-1 rounded ${COLORS[p.color].dark} ${COLORS[p.color].text}">
                                                    ${COLORS[p.color].name}
                                                </span>
                                                <span class="ml-2 text-gray-300">#${index + 1}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    ${p.id === this.player.id ? '<span class="px-3 py-1 bg-yellow-900 text-yellow-200 text-sm rounded-full">Te</span>' : ''}
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
                            <button id="startBtn" class="px-8 py-4 rounded-xl text-xl font-bold ${this.players.length < 2 ? 'bg-gray-700 cursor-not-allowed' : 'bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800'} transition-all">
                                <i class="fas fa-play mr-3"></i>
                                ${this.players.length < 2 ? 'Várj még játékosokat (min. 2)' : 'Játék indítása'}
                            </button>
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

        this.querySelector('#copyBtn').addEventListener('click', () => {
            navigator.clipboard.writeText(this.room.code);
            alert('Kód másolva!');
        });

        this.querySelector('#leaveBtn').addEventListener('click', () => this.leaveRoom());
        
        if (this.player.is_host) {
            this.querySelector('#startBtn').addEventListener('click', () => this.startGame());
        }
    }

    renderGame() {
        const currentPlayer = this.players.find(p => p.id === this.room.current_player_id);
        const isMyTurn = currentPlayer?.id === this.player.id;
        
        this.innerHTML = `
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
                        <div class="px-6 py-3 rounded-full ${COLORS[currentPlayer.color].bg} ${COLORS[currentPlayer.color].text} flex items-center">
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
                    <div class="flex-1 relative">
                        <div class="relative bg-gray-800 rounded-2xl p-2 lg:p-4 border-2 border-gray-700">
                            <div class="board-grid">
                                ${BOARD_LAYOUT.map((row, y) => 
                                    row.map((cell, x) => {
                                        let cellClass = 'cell-normal';
                                        if (cell.type === 'home') cellClass = `cell-home-${cell.color}`;
                                        else if (cell.type === 'safe') cellClass = 'cell-safe';
                                        else if (cell.type === 'path') cellClass = `cell-path-${cell.color}`;
                                        
                                        const piecesHere = getAllPiecesAtPosition(this.players, x, y);
                                        
                                        return `
                                            <div class="cell ${cellClass} relative flex items-center justify-center">
                                                ${cell.type === 'safe' ? '<i class="fas fa-star text-yellow-400 text-xs"></i>' : ''}
                                                ${piecesHere.map((piece, index) => {
                                                    const total = piecesHere.length;
                                                    const angle = (index / total) * 2 * Math.PI;
                                                    const radius = total > 1 ? 8 : 0;
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
                                <button id="diceBtn" class="w-20 h-20 flex items-center justify-center text-3xl font-bold rounded-xl border-4 ${currentPlayer ? COLORS[currentPlayer.color].border : 'border-gray-500'} bg-white text-black ${this.room.dice_rolling ? 'animate-pulse' : ''} ${!isMyTurn || this.room.dice_rolling ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'} transition-all">
                                    ${this.room.dice_value || '🎲'}
                                </button>
                                
                                ${currentPlayer && `
                                    <div class="text-center mt-2">
                                        <span class="px-3 py-1 rounded-full ${COLORS[currentPlayer.color].bg} ${COLORS[currentPlayer.color].text}">
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
                                        <div class="px-3 py-1 bg-yellow-600 text-yellow-100 text-sm rounded-full animate-pulse">
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
                                                <div class="text-xs">${status}</div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                                
                                <div class="mt-3 text-center text-sm">
                                    ${p.pieces.filter(pc => pc.position === 'home').length}/4 célban
                                </div>
                            </div>
                        `).join('')}
                        
                        <!-- Game Rules -->
                        <div class="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
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

        this.querySelector('#gameLeaveBtn').addEventListener('click', () => {
            if (confirm('Biztosan ki akarsz lépni a játékból?')) {
                this.leaveRoom();
            }
        });

        if (isMyTurn && !this.room.dice_rolling) {
            this.querySelector('#diceBtn').addEventListener('click', () => this.rollDice());
        }
    }
}

// Custom element definiálása
customElements.define('ludo-app', App);

// App indítása
document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('root');
    root.innerHTML = '<ludo-app></ludo-app>';
});
