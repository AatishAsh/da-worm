import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { networkInterfaces } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Game Config
const PORT = 3000;
const MAP_WIDTH = 2500;
const MAP_HEIGHT = 2500;
const BASE_SPEED = 3.5;
const BOOST_SPEED = 6.5;
const WORM_RADIUS = 12;
const FOOD_COUNT = 250;
const SPAWN_SHIELD_DURATION = 3000;
const TURN_RATE = 0.15;

// Game State
let gameState = 'lobby'; // 'lobby' or 'playing'
let hostId = null;
const players = new Map(); // id -> player object
const food = new Map(); // id -> food object
let currentMapWidth = MAP_WIDTH;
let currentMapHeight = MAP_HEIGHT;
let matchStartTime = 0;
let hasBroadcastShrinkStart = false;
let foodIdCounter = 0;

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function getRandomColor() {
  const colors = [
    '#FF595E', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function getSafeFoodPosition() {
  let attempts = 0;
  while (attempts < 25) {
    const x = Math.random() * (currentMapWidth - 100) + 50;
    const y = Math.random() * (currentMapHeight - 100) + 50;
    
    let tooClose = false;
    for (const player of players.values()) {
      if (player.isDead) continue;
      const dist = Math.hypot(player.x - x, player.y - y);
      if (dist < 150) { // Keep at least 150px away from any player head
        tooClose = true;
        break;
      }
    }
    
    if (!tooClose) {
      return { x, y };
    }
    attempts++;
  }
  return {
    x: Math.random() * (currentMapWidth - 100) + 50,
    y: Math.random() * (currentMapHeight - 100) + 50
  };
}

function spawnFood(count) {
  for (let i = 0; i < count; i++) {
    const id = `f_${foodIdCounter++}`;
    const pos = getSafeFoodPosition();
    const isBig = (i < 5); // Start with exactly 5 big gold dots in the arena
    food.set(id, {
      id,
      x: pos.x,
      y: pos.y,
      color: isBig ? '#FFCA3A' : getRandomColor(),
      value: isBig ? 10 : 1, // Big dots are worth 10 segments
    });
  }
}

spawnFood(FOOD_COUNT);

function getLocalIPs() {
  const nets = networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

// Broadcast to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// Send update of current lobby state to everyone
function sendLobbyUpdate() {
  const lobbyPlayers = [];
  players.forEach((p) => {
    lobbyPlayers.push({
      id: p.id,
      name: p.name,
      color: p.color,
      isHost: p.id === hostId,
      isReady: p.isReady,
    });
  });

  broadcast({
    type: 'lobby_update',
    gameState,
    hostId,
    players: lobbyPlayers,
  });
}

// Reset game to lobby state
function resetToLobby() {
  gameState = 'lobby';
  food.clear();
  spawnFood(FOOD_COUNT);
  
  players.forEach((player) => {
    player.isDead = false;
    player.body = [];
    player.score = 0;
    player.boost = false;
  });
  
  sendLobbyUpdate();
}

wss.on('connection', (ws) => {
  const playerId = generateId();
  let playerJoined = false;

  console.log(`Connection established: Temp ID ${playerId}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'join') {
        const name = (data.name || 'Anonymous').substring(0, 15);
        const color = data.color || getRandomColor();

        // Assign host if first to join
        if (!hostId) {
          hostId = playerId;
        }

        const startX = Math.random() * (currentMapWidth - 400) + 200;
        const startY = Math.random() * (currentMapHeight - 400) + 200;
        const startAngle = Math.random() * Math.PI * 2;

        const playerState = {
          id: playerId,
          name,
          color,
          x: startX,
          y: startY,
          angle: startAngle,
          targetAngle: startAngle,
          speed: BASE_SPEED,
          radius: WORM_RADIUS,
          score: 10,
          body: [],
          boost: false,
          isDead: false,
          spawnTime: gameState === 'playing' ? Date.now() : 0,
          lastBoostTick: 0,
          isReady: false,
        };

        // If joining during active gameplay, populate body segments immediately
        if (gameState === 'playing') {
          for (let i = 0; i < 10; i++) {
            playerState.body.push({
              x: startX - Math.cos(startAngle) * (i * 10),
              y: startY - Math.sin(startAngle) * (i * 10),
            });
          }
        }

        players.set(playerId, playerState);
        playerJoined = true;

        // Initialize client configuration
        ws.send(JSON.stringify({
          type: 'init',
          playerId,
          config: {
            mapWidth: currentMapWidth,
            mapHeight: currentMapHeight,
            spawnShield: SPAWN_SHIELD_DURATION,
          },
          gameState, // Expose ongoing game state to client
          foodList: Array.from(food.values()),
        }));

        sendLobbyUpdate();
        console.log(`Player ${name} (${playerId}) joined the lobby.`);

      } else if (data.type === 'start_game') {
        // Only host can start game
        if (playerId === hostId && gameState === 'lobby') {
          console.log('Host triggered game start!');
          
          gameState = 'playing';
          currentMapWidth = MAP_WIDTH;
          currentMapHeight = MAP_HEIGHT;
          matchStartTime = Date.now();
          hasBroadcastShrinkStart = false;
          
          // Initialize and spawn all lobby players
          players.forEach((player) => {
            const startX = Math.random() * (MAP_WIDTH - 400) + 200;
            const startY = Math.random() * (MAP_HEIGHT - 400) + 200;
            const startAngle = Math.random() * Math.PI * 2;

            player.x = startX;
            player.y = startY;
            player.angle = startAngle;
            player.targetAngle = startAngle;
            player.isDead = false;
            player.spawnTime = Date.now();
            player.score = 10;
            
            player.body = [];
            for (let i = 0; i < 10; i++) {
              player.body.push({
                x: startX - Math.cos(startAngle) * (i * 10),
                y: startY - Math.sin(startAngle) * (i * 10),
              });
            }
          });

          broadcast({
            type: 'game_start',
            foodList: Array.from(food.values())
          });
        }

      } else if (data.type === 'input' && playerJoined) {
        const player = players.get(playerId);
        if (player && !player.isDead && gameState === 'playing') {
          player.targetAngle = data.angle;
          player.boost = !!data.boost;
        }
      } else if (data.type === 'back_to_lobby') {
        if (playerId === hostId) {
          console.log('Host reset the arena back to lobby.');
          resetToLobby();
        }
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    console.log(`Connection closed: ${playerId}`);
    if (players.has(playerId)) {
      players.delete(playerId);
      
      // Reassign host if the host left
      if (hostId === playerId) {
        if (players.size > 0) {
          hostId = players.keys().next().value;
          console.log(`Host left. New host is: ${hostId}`);
        } else {
          hostId = null;
          gameState = 'lobby';
        }
      }

      if (gameState === 'lobby') {
        sendLobbyUpdate();
      } else {
        broadcast({ type: 'player_left', id: playerId });
        
        // If all players are dead or disconnected, go back to lobby
        const alivePlayers = Array.from(players.values()).filter(p => !p.isDead);
        if (alivePlayers.length === 0) {
          console.log('No alive players left in game. Resetting to lobby.');
          resetToLobby();
        }
      }
    }
  });
});

// Game loop (runs at 40 FPS)
let tickCount = 0;
setInterval(() => {
  if (gameState !== 'playing') return;

  const now = Date.now();
  const playerUpdates = [];
  let aliveCount = 0;

  // Handle Map Border Shrink
  const elapsed = now - matchStartTime;
  if (elapsed >= 60000) { // 1 minute
    if (!hasBroadcastShrinkStart) {
      broadcast({
        type: 'notification',
        message: '⚠️ <strong>The border is shrinking now!</strong>'
      });
      hasBroadcastShrinkStart = true;
    }
    
    // Shrink from 2500 to 500 over 9 minutes (540,000ms elapsed)
    const progress = Math.min(1, (elapsed - 60000) / 540000);
    currentMapWidth = Math.round(MAP_WIDTH - ((MAP_WIDTH - 500) * progress));
    currentMapHeight = Math.round(MAP_HEIGHT - ((MAP_HEIGHT - 500) * progress));

    // Cleanup food pellets outside the shrinking boundaries
    food.forEach((pellet) => {
      if (pellet.x > currentMapWidth - 10 || pellet.y > currentMapHeight - 10 || pellet.x < 10 || pellet.y < 10) {
        food.delete(pellet.id);
        broadcast({ type: 'eat_food', id: pellet.id, playerId: null });
      }
    });
  }

  // Update positions and handle boosting
  players.forEach((player) => {
    if (player.isDead) return;
    aliveCount++;

    const isInvulnerable = now - player.spawnTime < SPAWN_SHIELD_DURATION;
    const canBoost = player.boost && player.body.length > 5 && !isInvulnerable;
    player.speed = canBoost ? BOOST_SPEED : BASE_SPEED;

    // Handle boosting mass drop
    if (canBoost) {
      player.lastBoostTick++;
      if (player.lastBoostTick >= 10) {
        player.lastBoostTick = 0;
        
        const tail = player.body[player.body.length - 1];
        const newFoodId = `f_b_${foodIdCounter++}`;
        const newPellet = {
          id: newFoodId,
          x: tail.x + (Math.random() - 0.5) * 15,
          y: tail.y + (Math.random() - 0.5) * 15,
          color: player.color,
          value: 1,
        };
        food.set(newFoodId, newPellet);
        broadcast({ type: 'spawn_food', food: newPellet });

        player.body.pop();
        player.score = player.body.length;
      }
    }

    // Smooth turning
    let angleDiff = player.targetAngle - player.angle;
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

    if (Math.abs(angleDiff) < TURN_RATE) {
      player.angle = player.targetAngle;
    } else {
      player.angle += Math.sign(angleDiff) * TURN_RATE;
    }

    // Move Head
    player.x += Math.cos(player.angle) * player.speed;
    player.y += Math.sin(player.angle) * player.speed;

    // Arena boundary limits
    if (player.x < 0) player.x = 0;
    if (player.x > currentMapWidth) player.x = currentMapWidth;
    if (player.y < 0) player.y = 0;
    if (player.y > currentMapHeight) player.y = currentMapHeight;

    // Move Body
    let prevX = player.x;
    let prevY = player.y;
    const spacing = player.speed * 1.5;

    for (let i = 0; i < player.body.length; i++) {
      const seg = player.body[i];
      const dx = prevX - seg.x;
      const dy = prevY - seg.y;
      const dist = Math.hypot(dx, dy);

      if (dist > spacing) {
        const segAngle = Math.atan2(dy, dx);
        seg.x = prevX - Math.cos(segAngle) * spacing;
        seg.y = prevY - Math.sin(segAngle) * spacing;
      }
      prevX = seg.x;
      prevY = seg.y;
    }

    playerUpdates.push({
      id: player.id,
      name: player.name,
      color: player.color,
      x: Math.round(player.x),
      y: Math.round(player.y),
      angle: player.angle,
      // Flatten body [{x, y}, ...] to flat integer array [x1, y1, x2, y2, ...]
      body: player.body.flatMap(seg => [Math.round(seg.x), Math.round(seg.y)]),
      score: player.score,
      boost: player.boost,
      isInvulnerable,
    });
  });

  // Collision Detection: Food
  players.forEach((player) => {
    if (player.isDead) return;

    food.forEach((pellet) => {
      const dist = Math.hypot(player.x - pellet.x, player.y - pellet.y);
      // Fix: Exact physical overlap threshold (head radius + food radius + 1px buffer)
      const pelletRadius = 4 + pellet.value * 2;
      const eatThreshold = player.radius + pelletRadius + 1;

      if (dist < eatThreshold) {
        food.delete(pellet.id);
        broadcast({ type: 'eat_food', id: pellet.id, playerId: player.id });

        const tail = player.body[player.body.length - 1] || { x: player.x, y: player.y };
        for (let j = 0; j < pellet.value; j++) {
          player.body.push({ x: tail.x, y: tail.y });
        }
        player.score = player.body.length;

        // Respawn replacement food at a safe position away from players after 5 seconds
        setTimeout(() => {
          if (gameState === 'playing') {
            const newFoodId = `f_${foodIdCounter++}`;
            const pos = getSafeFoodPosition();
            const isBig = Math.random() < 0.03; // 3% chance for replacement to be a big gold dot
            const newPellet = {
              id: newFoodId,
              x: pos.x,
              y: pos.y,
              color: isBig ? '#FFCA3A' : getRandomColor(),
              value: isBig ? 10 : 1,
            };
            food.set(newFoodId, newPellet);
            broadcast({ type: 'spawn_food', food: newPellet });
          }
        }, 5000); // 5 seconds delay
      }
    });
  });

  // Collision Detection: Worm-to-Worm and Wall Crash
  players.forEach((player) => {
    if (player.isDead) return;

    // Check Wall Crash against dynamic shrinking boarders
    if (player.x <= player.radius || player.x >= currentMapWidth - player.radius ||
        player.y <= player.radius || player.y >= currentMapHeight - player.radius) {
      killPlayer(player, 'wall');
      return;
    }

    const isInvulnerable = now - player.spawnTime < SPAWN_SHIELD_DURATION;
    if (isInvulnerable) return;

    let crashed = false;
    let killerName = '';

    players.forEach((other) => {
      if (crashed || other.isDead) return;

      const otherInvulnerable = now - other.spawnTime < SPAWN_SHIELD_DURATION;
      if (otherInvulnerable && other.id !== player.id) return;

      const bodyStartIndex = (other.id === player.id) ? 10 : 0;

      for (let i = bodyStartIndex; i < other.body.length; i++) {
        const seg = other.body[i];
        const dist = Math.hypot(player.x - seg.x, player.y - seg.y);
        
        if (dist < player.radius + 6) {
          crashed = true;
          killerName = other.name;
          break;
        }
      }
    });

    if (crashed) {
      killPlayer(player, killerName);
    }
  });

  // Send state updates to all clients with current active boundary dimensions
  broadcast({
    type: 'state',
    players: playerUpdates,
    tick: tickCount++,
    mapWidth: currentMapWidth,
    mapHeight: currentMapHeight,
  });

  // If everyone is dead, wait a few seconds and return to lobby
  if (aliveCount === 0 && players.size > 0) {
    console.log('All players are dead. Returning to lobby in 4 seconds.');
    setTimeout(() => {
      if (gameState === 'playing') {
        resetToLobby();
      }
    }, 4000);
  }

}, 33);

function killPlayer(player, killer) {
  player.isDead = true;
  console.log(`Player ${player.name} died. (Killer: ${killer})`);

  player.body.forEach((seg, index) => {
    if (index % 2 === 0) {
      const fId = `f_d_${foodIdCounter++}`;
      const pellet = {
        id: fId,
        x: seg.x + (Math.random() - 0.5) * 10,
        y: seg.y + (Math.random() - 0.5) * 10,
        color: player.color,
        value: 1, // Fix: Death food pellets also grow by exactly 1 segment
      };
      food.set(fId, pellet);
      broadcast({ type: 'spawn_food', food: pellet });
    }
  });

  broadcast({
    type: 'player_died',
    id: player.id,
    name: player.name,
    killer: killer,
  });
}

// Start HTTP Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🎮 DA WORM LAN MULTIPLAYER SERVER STARTED! 🎮`);
  console.log(`====================================================`);
  console.log(`Access the game room locally:`);
  console.log(`- http://localhost:${PORT}`);
  
  const localIPs = getLocalIPs();
  localIPs.forEach((ip) => {
    console.log(`- http://${ip}:${PORT}`);
  });
  console.log(`====================================================`);
  console.log(`Make sure other players are on the same Wi-Fi/hotspot!`);
  console.log(`====================================================`);
});
