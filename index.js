import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import User from "./models/User.js";
import Message from "./models/Message.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import "dotenv/config";
// import jwt from "jsonwebtoken";

const PORT = process.env.PORT;

mongoose
  .connect(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

const app = express();
app.use(cors());
app.use(express.json());

app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  try {
    const existing = await User.findOne({ username });
    if (existing)
      return res.status(400).json({ message: "Username already taken" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashedPassword });
    res.status(201).json({ message: "User created", username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials" });

    // const payload = {
    //   username: user.username,
    //   userId: user._id,
    // };

    // const token = jwt.sign(payload, process.env.JWT_SECRET, {
    //   expiresIn: "3d",
    // });

    // console.log(token);

    res
      .status(200)
      .json({ message: "Login successful", username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// const users = {}
const users = new Map(); // Map username to socket

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("register", async (username) => {
    const existing = await User.findOne({ username });
    if (existing) {
      existing.socketId = socket.id;
      existing.isOnline = true;
      await existing.save();
    } else {
      await User.create({ username, socketId: socket.id, isOnline: true });
    }
    users.set(username, socket.id);
    socket.username = username;

    io.emit("user_status", { username, status: "online" });
  });

  socket.on("send_message", async ({ to, message, from }) => {
    await Message.create({ from, to, message });
    const recipient = await User.findOne({ username: to });

    if (recipient?.isOnline && recipient?.socketId) {
      io.to(recipient.socketId).emit("receive_message", { from, message });
    }
  });

  socket.on("typing", ({ to, from }) => {
    const toSocket = users.get(to);
    if (toSocket) {
      io.to(toSocket).emit("typing", { from });
    }
  });

  socket.on("disconnect", async () => {
    if (socket.username) {
      users.delete(socket.username);
      await User.findOneAndUpdate(
        { username: socket.username },
        { isOnline: false, socketId: null }
      );
      console.log(`${socket.username} disconnected, marking offline.`);
      io.emit("user_status", { username: socket.username, status: "offline" });
    }
  });
});

app.get("/messages/:user1/:user2", async (req, res) => {
  const { user1, user2 } = req.params;
  const messages = await Message.find({
    $or: [
      { from: user1, to: user2 },
      { from: user2, to: user1 },
    ],
  }).sort({ timestamp: 1 });

  res.json(messages);
});

app.get("/status/:username", async (req, res) => {
  const user = await User.findOne({ username: req.params.username });
  if (user) {
    res.json({ status: user.isOnline ? "online" : "offline" });
  } else {
    res.status(404).json({ status: "offline" });
  }
});

app.get("/user/:username", async (req, res) => {
  const user = await User.findOne({ username: req.params.username });
  if (user) {
    res.json({ user: "exists" }).status(200);
  } else {
    res.status(409).json({ user: "user not found" });
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
