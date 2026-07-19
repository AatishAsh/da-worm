import { WebSocket } from 'ws';

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  console.log('Connected to server!');
  
  // Join lobby
  ws.send(JSON.stringify({
    type: 'join',
    name: 'DebugBot',
    color: '#00f0ff'
  }));
});

ws.on('message', (message) => {
  const data = JSON.parse(message);
  console.log(`Received message type: ${data.type}`);
  
  if (data.type === 'init') {
    console.log('Init details:');
    console.log(`Player ID: ${data.playerId}`);
    console.log(`Food count: ${data.foodList.length}`);
    
    // Send start game (since we are the first/host)
    setTimeout(() => {
      console.log('Triggering start game...');
      ws.send(JSON.stringify({ type: 'start_game' }));
    }, 1000);
  }
  
  if (data.type === 'lobby_update') {
    console.log('Lobby Update:');
    console.log(data.players);
  }
  
  if (data.type === 'game_start') {
    console.log('Game Started!');
  }
  
  if (data.type === 'state') {
    console.log('State tick update:');
    const me = data.players.find(p => p.name === 'DebugBot');
    if (me) {
      console.log(`Position: (${me.x}, ${me.y})`);
      console.log(`Body payload (raw):`, me.body);
      console.log(`Is body array?`, Array.isArray(me.body));
      console.log(`Body length:`, me.body.length);
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('Socket error:', err);
});
