// Setup Canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const minimapCanvas = document.getElementById('minimapCanvas');
const mCtx = minimapCanvas.getContext('2d');

// Game State Variables
let socket = null;
let playerId = null;
let isHost = false;
let me = null;
let serverPlayers = [];
let clientPlayers = new Map();
let foodMap = new Map();
let gameConfig = { mapWidth: 2500, mapHeight: 2500, spawnShield: 3000 };
let isConnected = false;
let isDead = true;
let currentGameState = 'lobby';

// Camera
let camera = { x: 1250, y: 1250, zoom: 1 };

// Particles
let particles = [];

// Input
let mouse = { x: 0, y: 0 };
let targetAngle = 0;
let isBoosting = false;

// Audio
let audioCtx = null;

// Neon Colors
const SKIN_COLORS = [
  { name: 'cyan', code: '#00f0ff' },
  { name: 'pink', code: '#ff007f' },
  { name: 'green', code: '#39ff14' },
  { name: 'yellow', code: '#ffff00' },
  { name: 'orange', code: '#ff5f00' },
  { name: 'purple', code: '#bd00ff' },
  { name: 'red', code: '#ff0000' },
  { name: 'mint', code: '#00ffcc' }
];
let selectedColor = SKIN_COLORS[0].code;

// UI Elements
const lobbyScreen = document.getElementById('lobbyScreen');
const partyLobbyScreen = document.getElementById('partyLobbyScreen');
const lobbyPlayersList = document.getElementById('lobbyPlayersList');
const hostControls = document.getElementById('hostControls');
const guestStatus = document.getElementById('guestStatus');
const startGameBtn = document.getElementById('startGameBtn');
const hostResetBtn = document.getElementById('hostResetBtn');

const nicknameInput = document.getElementById('nickname');
const colorPicker = document.getElementById('colorPicker');
const joinBtn = document.getElementById('joinBtn');
const connStatus = document.getElementById('connStatus');
const gameHud = document.getElementById('gameHud');
const leaderboardList = document.getElementById('leaderboardList');
const statLength = document.getElementById('statLength');
const statSpeed = document.getElementById('statSpeed');
const boostIndicator = document.getElementById('boostIndicator');
const killFeed = document.getElementById('killFeed');

const deathScreen = document.getElementById('deathScreen');
const deathMessage = document.getElementById('deathMessage');
const finalScore = document.getElementById('finalScore');
const backToLobbyBtn = document.getElementById('backToLobbyBtn');

// Initialize Lobby UX
function initLobby() {
  const savedNick = localStorage.getItem('daWormNick');
  if (savedNick) {
    nicknameInput.value = savedNick;
  }

  const savedColor = localStorage.getItem('daWormColor');
  if (savedColor) {
    selectedColor = savedColor;
  }

  // Generate color options
  colorPicker.innerHTML = '';
  SKIN_COLORS.forEach(color => {
    const opt = document.createElement('div');
    opt.className = 'color-option';
    opt.style.backgroundColor = color.code;
    opt.style.color = color.code;
    if (color.code === selectedColor) {
      opt.classList.add('selected');
    }
    opt.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
      opt.classList.add('selected');
      selectedColor = color.code;
      localStorage.setItem('daWormColor', color.code);
    });
    colorPicker.appendChild(opt);
  });

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Button Listeners
  joinBtn.addEventListener('click', joinLobby);
  
  startGameBtn.addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'start_game' }));
    }
  });

  hostResetBtn.addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'back_to_lobby' }));
    }
  });

  backToLobbyBtn.addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'back_to_lobby' }));
    }
  });

  nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      joinLobby();
    }
  });

  // Start Connection
  connectWS();
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// Audio Synth Functions
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playEatSound() {
  if (!audioCtx) return;
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(320, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + 0.08);
  
  gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}

function playDeathSound() {
  if (!audioCtx) return;
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(180, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(40, audioCtx.currentTime + 0.4);
  
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.4);
}

function playKillSound() {
  if (!audioCtx) return;
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(440, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);
  
  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.15);
}

// WS Connection
function connectWS() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}`;
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    isConnected = true;
    connStatus.innerHTML = '<span class="status-dot connected"></span> Connected to Server';
  };

  socket.onclose = () => {
    isConnected = false;
    isDead = true;
    currentGameState = 'lobby';
    connStatus.innerHTML = '<span class="status-dot disconnected"></span> Disconnected. Reconnecting...';
    
    // Reset overlays
    partyLobbyScreen.classList.add('hidden');
    gameHud.classList.add('hidden');
    deathScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    
    setTimeout(connectWS, 3000);
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'init') {
      playerId = data.playerId;
      gameConfig = data.config;
      
      foodMap.clear();
      data.foodList.forEach(item => {
        foodMap.set(item.id, item);
      });
      
      lobbyScreen.classList.add('hidden');
      partyLobbyScreen.classList.remove('hidden');
      
    } else if (data.type === 'lobby_update') {
      currentGameState = data.gameState;
      isHost = (data.hostId === playerId);

      if (currentGameState === 'lobby') {
        // Show lobby overlay, hide play/death overlays
        partyLobbyScreen.classList.remove('hidden');
        gameHud.classList.add('hidden');
        deathScreen.classList.add('hidden');
        
        // Render lobby players
        renderLobbyPlayers(data.players);

        // Render host controls
        if (isHost) {
          hostControls.classList.remove('hidden');
          guestStatus.classList.add('hidden');
          hostResetBtn.classList.remove('hidden');
          backToLobbyBtn.classList.remove('hidden');
        } else {
          hostControls.classList.add('hidden');
          guestStatus.classList.remove('hidden');
          hostResetBtn.classList.add('hidden');
          backToLobbyBtn.classList.add('hidden');
        }
      }

    } else if (data.type === 'game_start') {
      currentGameState = 'playing';
      isDead = false;
      clientPlayers.clear();
      particles = [];
      
      partyLobbyScreen.classList.add('hidden');
      deathScreen.classList.add('hidden');
      gameHud.classList.remove('hidden');
      
      showKillFeedMessage('🚀 <strong>Match Started! Go, go, go!</strong>');

    } else if (data.type === 'spawn_food') {
      foodMap.set(data.food.id, data.food);

    } else if (data.type === 'eat_food') {
      const pellet = foodMap.get(data.id);
      if (pellet) {
        pellet.isPendingEat = true;
        pellet.eatenByPlayerId = data.playerId;
      }

    } else if (data.type === 'player_left') {
      const p = clientPlayers.get(data.id);
      if (p) {
        showKillFeedMessage(`🚪 <strong>${p.name}</strong> left the game.`);
        clientPlayers.delete(data.id);
      }

    } else if (data.type === 'player_died') {
      const victim = clientPlayers.get(data.id) || { name: data.name || 'Worm' };
      
      if (victim && victim.renderX) {
        spawnDeathParticles(victim.renderX, victim.renderY, victim.color || '#ffffff');
      }

      if (data.id === playerId) {
        isDead = true;
        playDeathSound();
        gameHud.classList.add('hidden');
        deathScreen.classList.remove('hidden');
        finalScore.innerText = me ? me.score : 0;
        
        let killMsg = 'You crashed!';
        if (data.killer === 'wall') {
          killMsg = 'You crashed into the boundary wall.';
        } else {
          killMsg = `You were destroyed by ${data.killer}.`;
        }
        deathMessage.innerText = killMsg;
      } else {
        if (data.killer === me?.name) {
          playKillSound();
          showKillFeedMessage(`🔥 You obliterated <strong>${victim.name}</strong>!`);
        } else {
          showKillFeedMessage(`💀 <strong>${victim.name}</strong> crashed into ${data.killer === 'wall' ? 'the wall' : `<strong>${data.killer}</strong>`}`);
        }
      }
      clientPlayers.delete(data.id);

    } else if (data.type === 'state') {
      serverPlayers = data.players;
      me = serverPlayers.find(p => p.id === playerId);
      
      if (me) {
        statLength.innerText = me.score;
        statSpeed.innerText = me.boost ? 'BOOSTING' : 'NORMAL';
        if (me.boost) {
          boostIndicator.classList.add('active');
          boostIndicator.innerText = 'BOOSTING';
        } else {
          boostIndicator.classList.remove('active');
          boostIndicator.innerText = 'BOOST READY';
        }
      }
      updateLeaderboard();
    }
  };
}

// Join the game lobby (pre-game)
function joinLobby() {
  if (!isConnected) return;
  initAudio();
  const name = nicknameInput.value.trim() || 'Anonymous';
  localStorage.setItem('daWormNick', name);

  socket.send(JSON.stringify({
    type: 'join',
    name: name,
    color: selectedColor
  }));
}

// Render player list inside lobby
function renderLobbyPlayers(playersList) {
  lobbyPlayersList.innerHTML = '';
  playersList.forEach(p => {
    const li = document.createElement('li');
    
    const dot = document.createElement('div');
    dot.className = 'lobby-color-dot';
    dot.style.color = p.color;
    dot.style.backgroundColor = p.color;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'lobby-name';
    nameSpan.innerText = p.name;
    
    li.appendChild(dot);
    li.appendChild(nameSpan);

    if (p.isHost) {
      const hostBadge = document.createElement('span');
      hostBadge.className = 'lobby-badge host';
      hostBadge.innerText = 'HOST👑';
      li.appendChild(hostBadge);
    }
    
    if (p.id === playerId) {
      const youBadge = document.createElement('span');
      youBadge.className = 'lobby-badge you';
      youBadge.innerText = 'YOU';
      li.appendChild(youBadge);
    }
    
    lobbyPlayersList.appendChild(li);
  });
}

// Particle emitters
function spawnEatenParticles(x, y, color) {
  for (let i = 0; i < 4; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      radius: Math.random() * 2 + 1,
      color,
      alpha: 1,
      decay: Math.random() * 0.08 + 0.04
    });
  }
}

function spawnDeathParticles(x, y, color) {
  for (let i = 0; i < 30; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12,
      radius: Math.random() * 6 + 3,
      color,
      alpha: 1,
      decay: Math.random() * 0.02 + 0.01
    });
  }
}

function spawnBoostParticles(x, y, color) {
  particles.push({
    x: x + (Math.random() - 0.5) * 8,
    y: y + (Math.random() - 0.5) * 8,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    radius: Math.random() * 4 + 2,
    color,
    alpha: 0.8,
    decay: 0.03
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= p.decay;
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }
}

// Kill Feed Overlay
function showKillFeedMessage(htmlContent) {
  const item = document.createElement('div');
  item.className = 'kill-msg';
  item.innerHTML = htmlContent;
  killFeed.appendChild(item);

  setTimeout(() => {
    item.remove();
  }, 3000);
}

// Leaderboard Sync
function updateLeaderboard() {
  const sorted = [...serverPlayers].sort((a, b) => b.score - a.score);
  
  leaderboardList.innerHTML = '';
  sorted.slice(0, 10).forEach((p, idx) => {
    const li = document.createElement('li');
    
    const rankSpan = document.createElement('span');
    rankSpan.className = 'rank';
    rankSpan.innerText = idx + 1;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    if (p.id === playerId) {
      nameSpan.classList.add('current-player');
      nameSpan.innerText = `${p.name} (You)`;
    } else {
      nameSpan.innerText = p.name;
    }
    
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'score';
    scoreSpan.innerText = p.score;
    
    li.appendChild(rankSpan);
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    leaderboardList.appendChild(li);
  });
}

// Input Controls
window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  
  if (!isDead && me) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    targetAngle = Math.atan2(mouse.y - centerY, mouse.x - centerX);
  }
});

window.addEventListener('mousedown', (e) => {
  if (!isDead && e.button === 0) {
    isBoosting = true;
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    isBoosting = false;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    if (isDead) {
      // Ignore spacer spawning during active games
    } else {
      isBoosting = true;
    }
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    isBoosting = false;
    e.preventDefault();
  }
});

// Stream inputs to server (33 Hz)
setInterval(() => {
  if (isConnected && !isDead && socket.readyState === WebSocket.OPEN && currentGameState === 'playing') {
    socket.send(JSON.stringify({
      type: 'input',
      angle: targetAngle,
      boost: isBoosting
    }));
  }
}, 30);

// Rendering Engine
function render() {
  requestAnimationFrame(render);

  ctx.fillStyle = '#090a0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Update client position interpolation
  serverPlayers.forEach((sp) => {
    let cp = clientPlayers.get(sp.id);
    
    if (!cp) {
      const renderBody = sp.body.map(seg => ({ x: seg.x, y: seg.y }));
      cp = {
        id: sp.id,
        name: sp.name,
        color: sp.color,
        renderX: sp.x,
        renderY: sp.y,
        angle: sp.angle,
        renderBody: renderBody,
      };
      clientPlayers.set(sp.id, cp);
    } else {
      cp.renderX += (sp.x - cp.renderX) * 0.55;
      cp.renderY += (sp.y - cp.renderY) * 0.55;
      
      let angleDiff = sp.angle - cp.angle;
      angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
      cp.angle += angleDiff * 0.55;

      if (cp.renderBody.length !== sp.body.length) {
        if (cp.renderBody.length < sp.body.length) {
          const diff = sp.body.length - cp.renderBody.length;
          const lastSeg = cp.renderBody[cp.renderBody.length - 1] || { x: cp.renderX, y: cp.renderY };
          for (let i = 0; i < diff; i++) {
            cp.renderBody.push({ x: lastSeg.x, y: lastSeg.y });
          }
        } else {
          cp.renderBody.splice(sp.body.length);
        }
      }

      for (let i = 0; i < sp.body.length; i++) {
        if (cp.renderBody[i] && sp.body[i]) {
          cp.renderBody[i].x += (sp.body[i].x - cp.renderBody[i].x) * 0.55;
          cp.renderBody[i].y += (sp.body[i].y - cp.renderBody[i].y) * 0.55;
        }
      }
      
      cp.isInvulnerable = sp.isInvulnerable;
      cp.score = sp.score;
      cp.boost = sp.boost;
    }

    if (cp.boost && Math.random() < 0.35) {
      const tail = cp.renderBody[cp.renderBody.length - 1] || { x: cp.renderX, y: cp.renderY };
      spawnBoostParticles(tail.x, tail.y, cp.color);
    }
  });

  clientPlayers.forEach((cp, id) => {
    if (!serverPlayers.some(sp => sp.id === id)) {
      clientPlayers.delete(id);
    }
  });

  const targetMe = clientPlayers.get(playerId);
  if (targetMe && !isDead && currentGameState === 'playing') {
    camera.x += (targetMe.renderX - camera.x) * 0.1;
    camera.y += (targetMe.renderY - camera.y) * 0.1;
  } else {
    const time = Date.now() * 0.0003;
    const pathRadius = 200;
    const mapCenterX = gameConfig.mapWidth / 2;
    const mapCenterY = gameConfig.mapHeight / 2;
    camera.x += (mapCenterX + Math.cos(time) * pathRadius - camera.x) * 0.02;
    camera.y += (mapCenterY + Math.sin(time) * pathRadius - camera.y) * 0.02;
  }

  const offsetX = canvas.width / 2 - camera.x;
  const offsetY = canvas.height / 2 - camera.y;

  drawGrid(offsetX, offsetY);
  drawBoundaries(offsetX, offsetY);
  
  if (currentGameState === 'playing') {
    drawFood(offsetX, offsetY);
  }

  updateParticles();
  drawParticles(offsetX, offsetY);

  if (currentGameState === 'playing') {
    drawWorms(offsetX, offsetY);
    drawMinimap();
  }
}

function drawGrid(offsetX, offsetY) {
  ctx.strokeStyle = '#141724';
  ctx.lineWidth = 1;
  const gridSize = 100;

  const startY = Math.floor((-offsetY) / gridSize) * gridSize;
  const endY = startY + canvas.height + gridSize;
  for (let y = startY; y < endY; y++) {
    if (y >= 0 && y <= gameConfig.mapHeight) {
      ctx.beginPath();
      ctx.moveTo(0, y + offsetY);
      ctx.lineTo(canvas.width, y + offsetY);
      ctx.stroke();
    }
  }

  const startX = Math.floor((-offsetX) / gridSize) * gridSize;
  const endX = startX + canvas.width + gridSize;
  for (let x = startX; x < endX; x++) {
    if (x >= 0 && x <= gameConfig.mapWidth) {
      ctx.beginPath();
      ctx.moveTo(x + offsetX, 0);
      ctx.lineTo(x + offsetX, canvas.height);
      ctx.stroke();
    }
  }
}

function drawBoundaries(offsetX, offsetY) {
  ctx.strokeStyle = '#ff0055';
  ctx.lineWidth = 8;
  ctx.strokeRect(offsetX, offsetY, gameConfig.mapWidth, gameConfig.mapHeight);
}

function drawFood(offsetX, offsetY) {
  foodMap.forEach((pellet, id) => {
    // Process client-side visual eating sync to hide latency
    if (pellet.isPendingEat) {
      const player = clientPlayers.get(pellet.eatenByPlayerId);
      let shouldRemove = false;
      if (player) {
        const dist = Math.hypot(player.renderX - pellet.x, player.renderY - pellet.y);
        const baseRadius = 12;
        const pelletRadius = 4 + pellet.value * 2;
        if (dist < baseRadius + pelletRadius + 2) {
          shouldRemove = true;
        }
      } else {
        shouldRemove = true; // player disconnected
      }

      if (shouldRemove) {
        spawnEatenParticles(pellet.x, pellet.y, pellet.color);
        if (pellet.eatenByPlayerId === playerId) {
          playEatSound();
        }
        foodMap.delete(id);
        return; // skip drawing
      }
    }

    const screenX = pellet.x + offsetX;
    const screenY = pellet.y + offsetY;
    const radius = 4 + pellet.value * 2;

    if (screenX + radius > 0 && screenX - radius < canvas.width &&
        screenY + radius > 0 && screenY - radius < canvas.height) {
      ctx.fillStyle = pellet.color;
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawParticles(offsetX, offsetY) {
  particles.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.arc(p.x + offsetX, p.y + offsetY, p.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1.0;
}

function drawWorms(offsetX, offsetY) {
  clientPlayers.forEach((player) => {
    const baseRadius = 12;
    ctx.shadowBlur = 0;

    for (let i = player.renderBody.length - 1; i >= 0; i--) {
      const seg = player.renderBody[i];
      const ratio = 1 - (i / player.renderBody.length) * 0.4;
      const radius = baseRadius * ratio;

      const screenX = seg.x + offsetX;
      const screenY = seg.y + offsetY;
      if (screenX + radius > 0 && screenX - radius < canvas.width &&
          screenY + radius > 0 && screenY - radius < canvas.height) {

        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(screenX - radius * 0.3, screenY - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const headX = player.renderX + offsetX;
    const headY = player.renderY + offsetY;

    if (headX + baseRadius > 0 && headX - baseRadius < canvas.width &&
        headY + baseRadius > 0 && headY - baseRadius < canvas.height) {
      
      if (player.isInvulnerable) {
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const shieldAlpha = 0.3 + Math.sin(Date.now() * 0.015) * 0.2;
        ctx.strokeStyle = `rgba(0, 240, 255, ${shieldAlpha})`;
        ctx.arc(headX, headY, baseRadius + 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(headX, headY, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(headX - baseRadius * 0.3, headY - baseRadius * 0.3, baseRadius * 0.3, 0, Math.PI * 2);
      ctx.fill();

      const eyeSpacing = 6;
      const eyeOffset = 5;
      const eyeRadius = 3.5;
      const pupilRadius = 1.5;

      const angleLeft = player.angle - Math.PI / 4.5;
      const angleRight = player.angle + Math.PI / 4.5;

      const leftEyeX = headX + Math.cos(angleLeft) * eyeOffset;
      const leftEyeY = headY + Math.sin(angleLeft) * eyeOffset;
      const rightEyeX = headX + Math.cos(angleRight) * eyeOffset;
      const rightEyeY = headY + Math.sin(angleRight) * eyeOffset;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(leftEyeX, leftEyeY, eyeRadius, 0, Math.PI * 2);
      ctx.arc(rightEyeX, rightEyeY, eyeRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000000';
      const pupilShiftX = Math.cos(player.angle) * 1;
      const pupilShiftY = Math.sin(player.angle) * 1;
      
      ctx.beginPath();
      ctx.arc(leftEyeX + pupilShiftX, leftEyeY + pupilShiftY, pupilRadius, 0, Math.PI * 2);
      ctx.arc(rightEyeX + pupilShiftX, rightEyeY + pupilShiftY, pupilRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = 'bold 11px Outfit';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(player.name, headX, headY - baseRadius - 6);
    }
  });
}

function drawMinimap() {
  mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  const scale = minimapCanvas.width / gameConfig.mapWidth;

  mCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  mCtx.lineWidth = 1;
  mCtx.strokeRect(0, 0, minimapCanvas.width, minimapCanvas.height);

  clientPlayers.forEach((player) => {
    const rx = player.renderX * scale;
    const ry = player.renderY * scale;

    mCtx.fillStyle = player.color;
    mCtx.beginPath();
    if (player.id === playerId) {
      const flash = (Math.sin(Date.now() * 0.015) > 0);
      mCtx.arc(rx, ry, flash ? 4.5 : 3, 0, Math.PI * 2);
    } else {
      mCtx.arc(rx, ry, 2, 0, Math.PI * 2);
    }
    mCtx.fill();
  });
}

window.onload = initLobby;
render();
