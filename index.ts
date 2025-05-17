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

const state = {
  // 이전과 동일하게 구조 유지 가능
  connectedUsers: {} as Record<string, { role: string; team: string | null }>,
  currentPlayer: null as any,
  playerQueue: [] as any[],
  passedPlayers: [] as any[],
  teamPlayers: {} as Record<string, any[]>,
  // ...등등
};

io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);

  socket.on("join", ({ userId, role, team }) => {
    state.connectedUsers[userId] = { role, team };
    console.log(`🙋 ${userId} joined as ${role} (${team})`);
    io.emit("userListUpdate", state.connectedUsers);
  });

  socket.on("startAuction", () => {
    console.log("🎯 Auction started!");
    // 경매 타이머/플레이어 로직 여기 넣기
    io.emit("auctionStarted");
  });

  socket.on("bid", ({ userId, bid }) => {
    console.log(`💰 ${userId} bid ${bid}`);
    io.emit("updateBid", { userId, bid });
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    // 필요한 정리 작업
  });
});

app.get("/", (_, res) => {
  res.send("✅ socket-server is running!");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
