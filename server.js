const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require("socket.io");
const fs = require('fs');
const bcrypt = require('bcryptjs');

const io = new Server(http);
app.use(express.static(__dirname));
app.use(express.json());

const USERS_FILE = './users.json';
const MSGS_FILE = './messages.json';

let users = {};
let messageHistory = {};

if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE));
if (fs.existsSync(MSGS_FILE)) messageHistory = JSON.parse(fs.readFileSync(MSGS_FILE));

const saveUsers = () => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
const saveMsgs = () => fs.writeFileSync(MSGS_FILE, JSON.stringify(messageHistory, null, 2));

let onlineUsers = new Set();

io.on('connection', (socket) => {
    socket.on('register user', (username) => {
        socket.username = username;
        onlineUsers.add(username);
        io.emit('online list', Array.from(onlineUsers));
    });

    socket.on('join room', (room) => {
        socket.rooms.forEach(r => { if(r !== socket.id) socket.leave(r); });
        socket.join(room);
        socket.emit('load history', messageHistory[room] || []);
    });

    socket.on('chat message', (data) => {
        data.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (!messageHistory[data.room]) messageHistory[data.room] = [];
        messageHistory[data.room].push(data);
        saveMsgs();
        io.to(data.room).emit('chat message', data);
    });

    socket.on('typing', (data) => socket.to(data.room).emit('display typing', data));

    socket.on('disconnect', () => {
        if (socket.username) {
            onlineUsers.delete(socket.username);
            io.emit('online list', Array.from(onlineUsers));
        }
    });
});

app.post('/signup', async (req, res) => {
    const { username, password } = req.body;
    if (users[username]) return res.status(400).send("Exists");
    users[username] = { password: await bcrypt.hash(password, 10), friends: [], requests: [] };
    saveUsers();
    res.json({ message: "Success" });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).send("Fail");
    res.json({ username, friends: user.friends, requests: user.requests });
});

app.get('/user-data/:username', (req, res) => res.json(users[req.params.username] || {}));

app.post('/send-request', (req, res) => {
    const { from, to } = req.body;
    if (users[to] && !users[to].requests.includes(from)) {
        users[to].requests.push(from);
        saveUsers();
    }
    res.send("Sent");
});

app.post('/accept-request', (req, res) => {
    const { user, friend } = req.body;
    users[user].friends.push(friend);
    users[friend].friends.push(user);
    users[user].requests = users[user].requests.filter(r => r !== friend);
    saveUsers();
    res.send("Accepted");
});

http.listen(8080, () => console.log('🚀 SkyText Ultra running on http://localhost:8080'));