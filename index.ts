// index.ts (단독 실행 서버)
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("✅ user connected", socket.id);

  socket.on("join", (msg) => {
    console.log("🙋 join:", msg);
    io.emit("newJoin", msg);
  });

  socket.on("disconnect", () => {
    console.log("❌ user disconnected", socket.id);
  });
});

app.get("/", (_, res) => {
  res.send("✅ socket.io server is running");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 server running on port ${PORT}`);
});
