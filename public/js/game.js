// Setup Canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const minimapCanvas = document.getElementById('minimapCanvas');
const mCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

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
let spectatePlayerId = null;
let hasJoined = false;

// Camera
let camera = { x: 1250, y: 1250, zoom: 1, rotation: 0 };

// Particles
let particles = [];

// Input
let targetAngle = 0;
let isBoosting = false;
let keyState = { left: false, right: false, boost: false };
let touchState = { left: false, right: false, boost: false };

// Audio
let audioCtx = null;

// Color Palette Colors
const SKIN_COLORS = [
  { name: 'coral', code: '#FF595E' },
  { name: 'yellow', code: '#FFCA3A' },
  { name: 'green', code: '#8AC926' },
  { name: 'blue', code: '#1982C4' },
  { name: 'purple', code: '#6A4C93' }
];
let selectedColor = SKIN_COLORS[3].code; // Default to Blue

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

const exitMatchBtn = document.getElementById('exitMatchBtn');
const deathScreen = document.getElementById('deathScreen');
const deathMessage = document.getElementById('deathMessage');
const finalScore = document.getElementById('finalScore');
const backToLobbyBtn = document.getElementById('backToLobbyBtn');

const spectateBtn = document.getElementById('spectateBtn');
const spectatorHud = document.getElementById('spectatorHud');
const specPlayerName = document.getElementById('specPlayerName');
const specPrevBtn = document.getElementById('specPrevBtn');
const specNextBtn = document.getElementById('specNextBtn');
const specExitBtn = document.getElementById('specExitBtn');

// Initialize Lobby UX
function initLobby() {
  const savedNick = localStorage.getItem('daWormNick');
  if (savedNick && nicknameInput) {
    nicknameInput.value = savedNick;
  }

  const savedColor = localStorage.getItem('daWormColor');
  if (savedColor) {
    selectedColor = savedColor;
  }

  // Generate color options
  if (colorPicker) {
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
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Button Listeners
  if (joinBtn) {
    joinBtn.addEventListener('click', joinLobby);
  }
  
  if (exitMatchBtn) {
    exitMatchBtn.addEventListener('click', () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'back_to_lobby' }));
      }
    });
  }

  if (startGameBtn) {
    startGameBtn.addEventListener('click', () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'start_game' }));
      }
    });
  }

  if (hostResetBtn) {
    hostResetBtn.addEventListener('click', () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'back_to_lobby' }));
      }
    });
  }

  if (backToLobbyBtn) {
    backToLobbyBtn.addEventListener('click', () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'back_to_lobby' }));
      }
    });
  }

  if (nicknameInput) {
    nicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        joinLobby();
      }
    });
  }

  if (spectateBtn) spectateBtn.addEventListener('click', startSpectating);
  if (specExitBtn) specExitBtn.addEventListener('click', stopSpectating);
  if (specPrevBtn) specPrevBtn.addEventListener('click', () => switchSpectate(-1));
  if (specNextBtn) specNextBtn.addEventListener('click', () => switchSpectate(1));

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
    if (connStatus) connStatus.innerHTML = '<span class="status-dot connected"></span> Connected to Server';
  };

  socket.onclose = () => {
    isConnected = false;
    isDead = true;
    hasJoined = false;
    currentGameState = 'lobby';
    if (connStatus) connStatus.innerHTML = '<span class="status-dot disconnected"></span> Disconnected. Reconnecting...';
    
    // Reset overlays
    partyLobbyScreen.classList.add('hidden');
    gameHud.classList.add('hidden');
    deathScreen.classList.add('hidden');
    spectatorHud.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    
    setTimeout(connectWS, 3000);
  };

  socket.onmessage = (event) => {
    // Ignore all broadcast events if this client hasn't officially clicked join yet
    if (!hasJoined) return;

    const data = JSON.parse(event.data);

    if (data.type === 'init') {
      playerId = data.playerId;
      gameConfig = data.config;
      
      foodMap.clear();
      data.foodList.forEach(item => {
        foodMap.set(item.id, item);
      });
      
      lobbyScreen.classList.add('hidden');
      
      if (data.gameState === 'playing') {
        currentGameState = 'playing';
        isDead = false;
        clientPlayers.clear();
        particles = [];
        spectatePlayerId = null;
        
        partyLobbyScreen.classList.add('hidden');
        deathScreen.classList.add('hidden');
        spectatorHud.classList.add('hidden');
        gameHud.classList.remove('hidden');
      } else {
        partyLobbyScreen.classList.remove('hidden');
      }
      
    } else if (data.type === 'lobby_update') {
      currentGameState = data.gameState;
      isHost = (data.hostId === playerId);

      if (currentGameState === 'lobby') {
        // Show lobby overlay, hide play/death/spectator overlays
        partyLobbyScreen.classList.remove('hidden');
        gameHud.classList.add('hidden');
        deathScreen.classList.add('hidden');
        spectatorHud.classList.add('hidden');
        spectatePlayerId = null;
        
        // Render lobby players
        renderLobbyPlayers(data.players);

        // Render host controls
        if (isHost || data.players.length <= 1) {
          if (hostControls) hostControls.classList.remove('hidden');
          if (guestStatus) guestStatus.classList.add('hidden');
        } else {
          if (hostControls) hostControls.classList.add('hidden');
          if (guestStatus) guestStatus.classList.remove('hidden');
        }
      }

    } else if (data.type === 'game_start') {
      currentGameState = 'playing';
      isDead = false;
      clientPlayers.clear();
      particles = [];
      spectatePlayerId = null;
      
      // Load refreshed food list for the new round
      foodMap.clear();
      if (data.foodList) {
        data.foodList.forEach(item => {
          foodMap.set(item.id, item);
        });
      }
      
      partyLobbyScreen.classList.add('hidden');
      deathScreen.classList.add('hidden');
      spectatorHud.classList.add('hidden');
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
      
      // Update dynamic shrinking border dimensions
      if (data.mapWidth !== undefined) gameConfig.mapWidth = data.mapWidth;
      if (data.mapHeight !== undefined) gameConfig.mapHeight = data.mapHeight;

      const wasMeNull = !me;
      me = serverPlayers.find(p => p.id === playerId);
      
      if (me) {
        if (wasMeNull) {
          targetAngle = me.angle;
        }
        if (statLength) statLength.innerText = me.score;
        if (statSpeed) statSpeed.innerText = me.boost ? 'BOOSTING' : 'NORMAL';
        if (boostIndicator) {
          if (me.boost) {
            boostIndicator.classList.add('active');
            boostIndicator.innerText = 'BOOSTING';
          } else {
            boostIndicator.classList.remove('active');
            boostIndicator.innerText = 'BOOST READY';
          }
        }
      }
      updateLeaderboard();

    } else if (data.type === 'notification') {
      showKillFeedMessage(data.message);
    }
  };
}

// Join the game lobby (pre-game)
function joinLobby() {
  initAudio();
  const name = nicknameInput ? nicknameInput.value.trim() || 'Anonymous' : 'Anonymous';
  localStorage.setItem('daWormNick', name);

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    if (connStatus) {
      connStatus.innerHTML = '<span class="status-dot disconnected"></span> Connecting to server... please wait';
    }
    connectWS();
    setTimeout(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        joinLobby();
      }
    }, 400);
    return;
  }

  hasJoined = true;
  socket.send(JSON.stringify({
    type: 'join',
    name: name,
    color: selectedColor
  }));
}

// Render player list inside lobby
function renderLobbyPlayers(playersList) {
  if (!lobbyPlayersList) return;
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
  if (!killFeed) return;
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
function updateInputState() {
  if (isDead || !me || currentGameState !== 'playing') return;

  const turnLeft = keyState.left || touchState.left;
  const turnRight = keyState.right || touchState.right;
  const boost = keyState.boost || touchState.boost;

  const TURN_SPEED = 0.075;

  if (turnLeft && !turnRight) {
    targetAngle -= TURN_SPEED;
  } else if (turnRight && !turnLeft) {
    targetAngle += TURN_SPEED;
  }

  targetAngle = Math.atan2(Math.sin(targetAngle), Math.cos(targetAngle));
  isBoosting = boost;
}

window.addEventListener('mousedown', (e) => {
  if (document.activeElement === nicknameInput) return;
  if (!isDead && e.button === 0) {
    keyState.boost = true;
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    keyState.boost = false;
  }
});

window.addEventListener('keydown', (e) => {
  if (document.activeElement === nicknameInput) return;

  // Catch Arrow Keys / WASD for switching spectated player
  if (spectatePlayerId !== null) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      switchSpectate(-1);
      e.preventDefault();
      return;
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      switchSpectate(1);
      e.preventDefault();
      return;
    }
  }

  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    keyState.left = true;
    e.preventDefault();
  }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    keyState.right = true;
    e.preventDefault();
  }
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    keyState.boost = true;
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    keyState.left = false;
    e.preventDefault();
  }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    keyState.right = false;
    e.preventDefault();
  }
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    keyState.boost = false;
    e.preventDefault();
  }
});

// Touch Controls for Mobile
function handleTouches(e) {
  if (isDead || currentGameState !== 'playing') {
    touchState.left = false;
    touchState.right = false;
    touchState.boost = false;
    return;
  }

  // Allow clicking buttons without triggering touch steering
  if (e.target.closest('#exitMatchBtn') || e.target.closest('.hud-panel') || e.target.closest('#spectatorHud') || e.target.closest('#deathScreen')) {
    return;
  }

  if (e.cancelable) {
    e.preventDefault();
  }

  if (e.type === 'touchstart') {
    initAudio();
  }

  let leftTouch = false;
  let rightTouch = false;

  for (let i = 0; i < e.touches.length; i++) {
    const t = e.touches[i];
    if (t.clientX < window.innerWidth / 2) {
      leftTouch = true;
    } else {
      rightTouch = true;
    }
  }

  touchState.left = leftTouch;
  touchState.right = rightTouch;
  touchState.boost = (leftTouch && rightTouch);
}

function updateTouchUI() {
  // Silent touch state sync without visual overlays
}

window.addEventListener('touchstart', handleTouches, { passive: false });
window.addEventListener('touchmove', handleTouches, { passive: false });
window.addEventListener('touchend', handleTouches, { passive: false });
window.addEventListener('touchcancel', handleTouches, { passive: false });

// Stream inputs to server (30 Hz)
setInterval(() => {
  updateInputState();
  if (isConnected && !isDead && socket.readyState === WebSocket.OPEN && currentGameState === 'playing') {
    socket.send(JSON.stringify({
      type: 'input',
      angle: targetAngle,
      boost: isBoosting
    }));
  }
}, 33);

// Rendering Engine
function render() {
  requestAnimationFrame(render);
  updateInputState();

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Update client position interpolation
  serverPlayers.forEach((sp) => {
    let cp = clientPlayers.get(sp.id);
    
    if (!cp) {
      // Decode flat coordinates array [x1, y1, x2, y2, ...]
      const renderBody = [];
      for (let i = 0; i < sp.body.length / 2; i++) {
        renderBody.push({
          x: sp.body[i * 2],
          y: sp.body[i * 2 + 1]
        });
      }
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
      // 30 FPS Linear Interpolation (LERP) (using 0.45 factor)
      cp.renderX += (sp.x - cp.renderX) * 0.45;
      cp.renderY += (sp.y - cp.renderY) * 0.45;
      
      let angleDiff = sp.angle - cp.angle;
      angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
      cp.angle += angleDiff * 0.45;

      const serverBodyLength = sp.body.length / 2;
      if (cp.renderBody.length !== serverBodyLength) {
        if (cp.renderBody.length < serverBodyLength) {
          const diff = serverBodyLength - cp.renderBody.length;
          const lastSeg = cp.renderBody[cp.renderBody.length - 1] || { x: cp.renderX, y: cp.renderY };
          for (let i = 0; i < diff; i++) {
            cp.renderBody.push({ x: lastSeg.x, y: lastSeg.y });
          }
        } else {
          cp.renderBody.splice(serverBodyLength);
        }
      }

      // Decode flat coordinates and LERP
      for (let i = 0; i < serverBodyLength; i++) {
        const targetX = sp.body[i * 2];
        const targetY = sp.body[i * 2 + 1];
        if (cp.renderBody[i] && targetX !== undefined) {
          cp.renderBody[i].x += (targetX - cp.renderBody[i].x) * 0.45;
          cp.renderBody[i].y += (targetY - cp.renderBody[i].y) * 0.45;
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
  let followPlayer = null;

  if (currentGameState === 'playing') {
    if (spectatePlayerId !== null) {
      followPlayer = clientPlayers.get(spectatePlayerId);
      // Auto-switch spectating targets if the player died or disconnected
      if (!followPlayer || !serverPlayers.some(sp => sp.id === spectatePlayerId)) {
        autoSwitchSpectate();
        followPlayer = clientPlayers.get(spectatePlayerId);
      }
    } else if (targetMe && !isDead) {
      followPlayer = targetMe;
    }
  }

  if (followPlayer) {
    camera.x += (followPlayer.renderX - camera.x) * 0.1;
    camera.y += (followPlayer.renderY - camera.y) * 0.1;

    let targetRot = -followPlayer.angle - Math.PI / 2;
    let rotDiff = targetRot - camera.rotation;
    rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));

    // Smooth, delayed rotation tracking with capped angular velocity to eliminate motion sickness
    const maxRotStep = 0.015;
    let rotStep = rotDiff * 0.025;
    if (Math.abs(rotStep) > maxRotStep) {
      rotStep = Math.sign(rotStep) * maxRotStep;
    }
    camera.rotation += rotStep;
  } else {
    const time = Date.now() * 0.0003;
    const pathRadius = 200;
    const mapCenterX = gameConfig.mapWidth / 2;
    const mapCenterY = gameConfig.mapHeight / 2;
    camera.x += (mapCenterX + Math.cos(time) * pathRadius - camera.x) * 0.02;
    camera.y += (mapCenterY + Math.sin(time) * pathRadius - camera.y) * 0.02;

    let rotDiff = 0 - camera.rotation;
    rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));
    camera.rotation += rotDiff * 0.02;
  }

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(camera.rotation);
  ctx.translate(-camera.x, -camera.y);

  drawGrid();
  drawBoundaries();
  
  if (currentGameState === 'playing') {
    drawFood();
  }

  updateParticles();
  drawParticles();

  if (currentGameState === 'playing') {
    drawWorms();
  }

  ctx.restore();

  if (currentGameState === 'playing') {
    drawMinimap();
  }
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.lineWidth = 1;
  const gridSize = 100;
  const diag = Math.hypot(canvas.width, canvas.height);

  const startY = Math.max(0, Math.floor((camera.y - diag / 2) / gridSize) * gridSize);
  const endY = Math.min(gameConfig.mapHeight, Math.ceil((camera.y + diag / 2) / gridSize) * gridSize);
  
  const startX = Math.max(0, Math.floor((camera.x - diag / 2) / gridSize) * gridSize);
  const endX = Math.min(gameConfig.mapWidth, Math.ceil((camera.x + diag / 2) / gridSize) * gridSize);

  for (let y = startY; y <= endY; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }

  for (let x = startX; x <= endX; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
    ctx.stroke();
  }
}

function drawBoundaries() {
  ctx.strokeStyle = '#FF595E';
  ctx.lineWidth = 12;
  ctx.strokeRect(0, 0, gameConfig.mapWidth, gameConfig.mapHeight);
}

function drawFood() {
  const diag = Math.hypot(canvas.width, canvas.height);
  const halfDiag = diag / 2;

  foodMap.forEach((pellet, id) => {
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
        shouldRemove = true;
      }

      if (shouldRemove) {
        spawnEatenParticles(pellet.x, pellet.y, pellet.color);
        if (pellet.eatenByPlayerId === playerId) {
          playEatSound();
        }
        foodMap.delete(id);
        return;
      }
    }

    const radius = 4 + pellet.value * 2;
    if (Math.abs(pellet.x - camera.x) < halfDiag + radius &&
        Math.abs(pellet.y - camera.y) < halfDiag + radius) {
      ctx.fillStyle = pellet.color;
      ctx.beginPath();
      ctx.arc(pellet.x, pellet.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1.0;
}

function drawWorms() {
  const diag = Math.hypot(canvas.width, canvas.height);
  const halfDiag = diag / 2;

  clientPlayers.forEach((player) => {
    const baseRadius = 12;
    ctx.shadowBlur = 0;

    for (let i = player.renderBody.length - 1; i >= 0; i--) {
      const seg = player.renderBody[i];
      const ratio = 1 - (i / player.renderBody.length) * 0.4;
      const radius = baseRadius * ratio;

      if (Math.abs(seg.x - camera.x) < halfDiag + radius &&
          Math.abs(seg.y - camera.y) < halfDiag + radius) {

        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(seg.x - radius * 0.3, seg.y - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const headX = player.renderX;
    const headY = player.renderY;

    if (Math.abs(headX - camera.x) < halfDiag + baseRadius &&
        Math.abs(headY - camera.y) < halfDiag + baseRadius) {
      
      if (player.isInvulnerable) {
        ctx.beginPath();
        const shieldAlpha = 0.3 + Math.sin(Date.now() * 0.015) * 0.2;
        ctx.strokeStyle = `rgba(0, 240, 255, ${shieldAlpha})`;
        ctx.lineWidth = 3;
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

      ctx.save();
      ctx.translate(headX, headY);
      ctx.rotate(-camera.rotation);
      ctx.font = 'bold 13px Yuyu';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.strokeText(player.name, 0, -baseRadius - 6);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(player.name, 0, -baseRadius - 6);
      ctx.restore();
    }
  });
}

function drawMinimap() {
  mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  const scale = minimapCanvas.width / gameConfig.mapWidth;

  mCtx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  mCtx.lineWidth = 1.5;
  mCtx.strokeRect(0, 0, minimapCanvas.width, minimapCanvas.height);

  clientPlayers.forEach((player) => {
    const rx = player.renderX * scale;
    const ry = player.renderY * scale;

    mCtx.fillStyle = player.color;
    mCtx.beginPath();
    if (player.id === playerId || player.id === spectatePlayerId) {
      const flash = (Math.sin(Date.now() * 0.015) > 0);
      mCtx.arc(rx, ry, flash ? 5 : 3.5, 0, Math.PI * 2);
      mCtx.fill();

      // Heading indicator vector on minimap
      mCtx.strokeStyle = player.color;
      mCtx.lineWidth = 2;
      mCtx.beginPath();
      mCtx.moveTo(rx, ry);
      mCtx.lineTo(rx + Math.cos(player.angle) * 10, ry + Math.sin(player.angle) * 10);
      mCtx.stroke();
    } else {
      mCtx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      mCtx.fill();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLobby);
} else {
  initLobby();
}
render();

// Spectator Mode Logic
function startSpectating() {
  deathScreen.classList.add('hidden');
  spectatorHud.classList.remove('hidden');
  gameHud.classList.remove('hidden');

  if (serverPlayers.length > 0) {
    // Select first active player
    spectatePlayerId = serverPlayers[0].id;
    updateSpectateUI();
  } else {
    spectatePlayerId = null;
    specPlayerName.innerText = 'No players alive';
    specPlayerName.style.color = '#ffffff';
  }
}

function stopSpectating() {
  spectatePlayerId = null;
  spectatorHud.classList.add('hidden');
  gameHud.classList.add('hidden');
  deathScreen.classList.remove('hidden');
}

function switchSpectate(direction) {
  if (serverPlayers.length === 0) {
    spectatePlayerId = null;
    specPlayerName.innerText = 'No players alive';
    specPlayerName.style.color = '#ffffff';
    return;
  }

  let index = serverPlayers.findIndex(sp => sp.id === spectatePlayerId);
  if (index === -1) {
    index = 0;
  } else {
    index = (index + direction + serverPlayers.length) % serverPlayers.length;
  }

  spectatePlayerId = serverPlayers[index].id;
  updateSpectateUI();
}

function autoSwitchSpectate() {
  if (serverPlayers.length > 0) {
    spectatePlayerId = serverPlayers[0].id;
    updateSpectateUI();
  } else {
    spectatePlayerId = null;
    specPlayerName.innerText = 'No players alive';
    specPlayerName.style.color = '#ffffff';
  }
}

function updateSpectateUI() {
  if (spectatePlayerId) {
    const p = clientPlayers.get(spectatePlayerId);
    if (p) {
      specPlayerName.innerText = p.name;
      specPlayerName.style.color = p.color;
    } else {
      specPlayerName.innerText = 'Connecting...';
      specPlayerName.style.color = '#ffffff';
    }
  } else {
    specPlayerName.innerText = 'No players alive';
    specPlayerName.style.color = '#ffffff';
  }
}
