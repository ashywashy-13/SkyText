const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

const USERS_FILE = './users.json';
const MESSAGES_FILE = './messages.json';

// Ensure files exist
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}));
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify({}));

// Auth Routes
app.post('/signup', async (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE));
    if (users[username]) return res.status(400).send("User exists");
    const hashed = await bcrypt.hash(password, 10);
    users[username] = { password: hashed, friends: [], requests: [] };
    fs.writeFileSync(USERS_FILE, JSON.stringify(users));
    res.send("OK");
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE));
    if (!users[username] || !await bcrypt.compare(password, users[username].password)) return res.status(401).send("Fail");
    res.json({ username });
});

app.get('/user-data/:user', (req, res) => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE));
    res.json(users[req.params.user] || {});
});

app.post('/send-request', (req, res) => {
    const { from, to } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE));
    if (users[to] && !users[to].requests.includes(from)) {
        users[to].requests.push(from);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users));
    }
    res.send("OK");
});

app.post('/accept-request', (req, res) => {
    const { user, friend } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE));
    users[user].friends.push(friend);
    users[friend].friends.push(user);
    users[user].requests = users[user].requests.filter(r => r !== friend);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users));
    res.send("OK");
});

// Socket.io Logic
let onlineUsers = {};

io.on('connection', (socket) => {
    socket.on('register user', (username) => {
        socket.username = username;
        onlineUsers[username] = socket.id;
        io.emit('online list', Object.keys(onlineUsers));
    });

    socket.on('join room', (room) => {
        socket.join(room);
        const history = JSON.parse(fs.readFileSync(MESSAGES_FILE))[room] || [];
        socket.emit('load history', history);
    });

    socket.on('chat message', (data) => {
        const messages = JSON.parse(fs.readFileSync(MESSAGES_FILE));
        if (!messages[data.room]) messages[data.room] = [];
        const msg = { ...data, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        messages[data.room].push(msg);
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages));
        io.to(data.room).emit('chat message', msg);
    });

    socket.on('typing', (data) => {
        socket.to(data.room).emit('display typing', data);
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.username];
        io.emit('online list', Object.keys(onlineUsers));
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));