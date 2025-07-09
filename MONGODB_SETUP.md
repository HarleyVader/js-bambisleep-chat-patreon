# MongoDB Setup Guide for WSL Debian

## ✅ Installation Complete!

MongoDB 7.0 has been successfully installed on your WSL Debian system.

## 🚀 Starting MongoDB

### Option 1: Using the provided script
```bash
# Make the script executable (run once)
chmod +x start-mongodb.sh

# Start MongoDB
wsl -d debian -- ./js-bambisleep-chat-patreon/start-mongodb.sh
```

### Option 2: Manual start
```bash
# Start MongoDB manually
wsl -d debian -- sudo -u mongodb mongod --dbpath /data/db --port 27017 --bind_ip 127.0.0.1 --fork
```

## 🔧 Configuration

### Update your `.env` file
Add this line to your `.env` file:
```
MONGODB_URI=mongodb://127.0.0.1:27017/bambisleep_chat
```

## 🧪 Testing the Connection

### Test from WSL
```bash
wsl -d debian -- mongosh mongodb://127.0.0.1:27017/bambisleep_chat --eval "db.runCommand({ping: 1})"
```

### Test from your Node.js app
The `/health` endpoint should now show:
- `database_configured: true`
- `database_status: "connected"`

## 📊 Database Management

### Access MongoDB Shell
```bash
wsl -d debian -- mongosh mongodb://127.0.0.1:27017/bambisleep_chat
```

### Common MongoDB Commands
```javascript
// Show databases
show dbs

// Use your database
use bambisleep_chat

// Show collections
show collections

// View users
db.users.find().pretty()

// View sessions
db.sessions.find().pretty()
```

## 🔄 Auto-Start (Optional)

To make MongoDB start automatically when WSL starts, add this to your WSL startup:

```bash
# Add to ~/.bashrc or ~/.profile in WSL
sudo -u mongodb mongod --dbpath /data/db --port 27017 --bind_ip 127.0.0.1 --fork
```

## 🛑 Stopping MongoDB

```bash
wsl -d debian -- sudo pkill mongod
```

## 📝 Notes

- MongoDB runs on port 27017
- Data is stored in `/data/db` inside WSL
- Logs are in `/var/log/mongodb/mongod.log`
- The database will persist between WSL restarts
- Your Node.js app will now be able to save user data and sessions

## 🎯 Next Steps

1. Start MongoDB using the script above
2. Update your `.env` file with the MongoDB URI
3. Restart your Node.js application
4. Visit `/health` to verify the database connection
