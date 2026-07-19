#!/bin/bash
# Resolve directory and move to workspace
cd "$(dirname "$0")"

echo "===================================================="
echo "🚀 STARTING DA WORM MULTIPLAYER LAN SERVER..."
echo "===================================================="

# Run Node Server in background
node server.js &
SERVER_PID=$!

# Wait for server setup
sleep 1.5

# Open browser automatically
if command -v xdg-open > /dev/null; then
  xdg-open "http://localhost:3000"
elif command -v open > /dev/null; then
  open "http://localhost:3000"
else
  echo "🌐 Access the game in your browser: http://localhost:3000"
fi

echo "===================================================="
echo "💡 Press Ctrl+C in this terminal window to stop the server"
echo "===================================================="

# Keep script running and bind shutdown signals
trap "kill $SERVER_PID; exit" INT TERM
wait $SERVER_PID
