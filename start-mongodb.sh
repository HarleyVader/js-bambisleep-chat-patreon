#!/bin/bash
# MongoDB Startup Script for WSL Debian
# Usage: ./start-mongodb.sh

echo "🚀 Starting MongoDB for BambiSleep project..."

# Create data directory if it doesn't exist
sudo mkdir -p /data/db
sudo chown mongodb:mongodb /data/db

# Kill any existing mongod processes
sudo pkill mongod 2>/dev/null || true
sleep 2

# Start MongoDB
echo "📡 Starting MongoDB daemon..."
sudo -u mongodb mongod \
  --dbpath /data/db \
  --logpath /var/log/mongodb/mongod.log \
  --port 27017 \
  --bind_ip 127.0.0.1 \
  --fork

# Wait for MongoDB to start
sleep 3

# Check if MongoDB is running
if pgrep mongod > /dev/null; then
    echo "✅ MongoDB started successfully!"
    echo ""
    echo "📊 Connection Details:"
    echo "   Host: 127.0.0.1"
    echo "   Port: 27017"
    echo "   Database: bambisleep_chat"
    echo "   Connection String: mongodb://127.0.0.1:27017/bambisleep_chat"
    echo ""
    echo "🧪 Testing connection..."
    mongosh --quiet --eval "
      use bambisleep_chat;
      db.runCommand({ping: 1});
      print('✅ Database connection successful!');
    " 2>/dev/null || echo "⚠️ MongoDB running but connection test failed"
else
    echo "❌ MongoDB failed to start!"
    echo "Check logs: sudo tail -20 /var/log/mongodb/mongod.log"
    exit 1
fi
