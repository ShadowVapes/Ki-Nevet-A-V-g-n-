// Game constants and logic
const COLORS = {
    red: { id: 'red', name: 'Piros', bg: 'bg-red-600', light: 'bg-red-400', dark: 'bg-red-800', text: 'text-red-100', border: 'border-red-500' },
    blue: { id: 'blue', name: 'Kék', bg: 'bg-blue-600', light: 'bg-blue-400', dark: 'bg-blue-800', text: 'text-blue-100', border: 'border-blue-500' },
    green: { id: 'green', name: 'Zöld', bg: 'bg-green-600', light: 'bg-green-400', dark: 'bg-green-800', text: 'text-green-100', border: 'border-green-500' },
    yellow: { id: 'yellow', name: 'Sárga', bg: 'bg-yellow-600', light: 'bg-yellow-400', dark: 'bg-yellow-800', text: 'text-yellow-100', border: 'border-yellow-500' }
};

const BOARD_LAYOUT = generateBoard();

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
    
    // Paths - Simplified for demo
    // Red path
    for (let i = 6; i <= 8; i++) {
        board[13][i] = { type: 'path', color: 'red' };
    }
    // Blue path
    for (let i = 6; i <= 8; i++) {
        board[1][i] = { type: 'path', color: 'blue' };
    }
    // Green path
    for (let i = 6; i <= 8; i++) {
        board[i][1] = { type: 'path', color: 'green' };
    }
    // Yellow path
    for (let i = 6; i <= 8; i++) {
        board[i][13] = { type: 'path', color: 'yellow' };
    }
    
    return board;
}

function createInitialPieces(color) {
    return [
        { id: uuid.v4(), position: 'base', x: null, y: null, color, index: 0 },
        { id: uuid.v4(), position: 'base', x: null, y: null, color, index: 1 },
        { id: uuid.v4(), position: 'base', x: null, y: null, color, index: 2 },
        { id: uuid.v4(), position: 'base', x: null, y: null, color, index: 3 }
    ];
}

function getMoveablePieces(player, diceValue, allPlayers) {
    const moveable = [];
    player.pieces.forEach(piece => {
        if (piece.position === 'base' && diceValue === 6) {
            moveable.push(piece);
        } else if (piece.position === 'path') {
            // Simplified: can always move if on path
            moveable.push(piece);
        }
    });
    return moveable;
}

function calculateNewPosition(piece, diceValue) {
    if (piece.position === 'base' && diceValue === 6) {
        // Start position for each color
        const startPositions = {
            red: { x: 6, y: 13 },
            blue: { x: 8, y: 1 },
            green: { x: 1, y: 8 },
            yellow: { x: 13, y: 6 }
        };
        return { ...piece, position: 'path', ...startPositions[piece.color] };
    }
    
    if (piece.position === 'path') {
        // Simplified movement: move 1 cell in direction
        let newX = piece.x;
        let newY = piece.y;
        
        if (piece.color === 'red') newY = Math.max(0, piece.y - 1);
        else if (piece.color === 'blue') newY = Math.min(14, piece.y + 1);
        else if (piece.color === 'green') newX = Math.min(14, piece.x + 1);
        else if (piece.color === 'yellow') newX = Math.max(0, piece.x - 1);
        
        return { ...piece, x: newX, y: newY };
    }
    
    return piece;
}

function checkCapture(piece, newPos, allPlayers) {
    const captures = [];
    allPlayers.forEach(player => {
        player.pieces.forEach(p => {
            if (p.position === 'path' && p.x === newPos.x && p.y === newPos.y && p.color !== piece.color) {
                captures.push({ pieceId: p.id, playerId: player.id });
            }
        });
    });
    return captures;
}

function getNextPlayer(currentPlayerId, players, extraTurn = false) {
    if (extraTurn) return currentPlayerId;
    const currentIndex = players.findIndex(p => p.id === currentPlayerId);
    const nextIndex = (currentIndex + 1) % players.length;
    return players[nextIndex].id;
}

function getAllPiecesAtPosition(allPlayers, x, y) {
    const pieces = [];
    allPlayers.forEach(player => {
        player.pieces.forEach(piece => {
            if (piece.position === 'path' && piece.x === x && piece.y === y) {
                pieces.push({ ...piece, playerId: player.id, playerName: player.name });
            }
        });
    });
    return pieces;
}
