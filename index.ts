import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
  path: "/socket.io",
});

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("startAuction", () => {
    console.log("🎯 경매 시작 요청 수신");
    io.emit("auctionStarted");
  });

  socket.on("bid", ({ userId, amount }) => {
    console.log(`💰 ${userId} 입찰: ${amount}P`);
    io.emit("bidUpdate", { userId, amount });
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

app.use(cors());
app.get("/", (_: Request, res: Response) => {
  res.send("✅ Socket.io server running!");
});
``;

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
