import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import cors from "cors";
import { PLAYERS, PlayerBasic } from "./lib/players";
import { getAllPlayerStats } from "./lib/winrate";
const app = express();
const server = createServer(app);
const io = new IOServer(server, {
  cors: {
    origin: "*",
  },
  path: "/socket.io",
});

// --- 전체 상태 객체 ---
const state = {
  playerQueue: [...PLAYERS],
  passedPlayers: [] as PlayerBasic[],
  currentPlayer: null as PlayerBasic | null,
  currentBid: 0,
  remainingTime: 0,
  currentBidder: null as string | null,
  biddingTimer: null as NodeJS.Timeout | null,
  countdownTimer: null as NodeJS.Timeout | null,
  teamPlayers: {} as Record<string, PlayerBasic[]>,
  bidHistory: {} as Record<string, number>,
  historyEntries: [] as { player: PlayerBasic; team: string; bid: number }[],
  userPoints: {} as Record<string, number>,
  userSocketMap: {} as Record<string, string>,
  connectedUsers: {} as Record<string, { role: string; team: string | null }>,
  fullPlayerDataMap: {} as Record<string, any>,
  isRetryingPassed: false,
};

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function emitAuctionSync(io: IOServer) {
  const payload = {
    syncedTeams: state.teamPlayers,
    syncedBids: state.bidHistory,
    syncedHistory: state.historyEntries,
  };

  io.emit("auctionSync", payload);
  io.emit("teamPanelSync", payload);
}

function emitCurrentPlayer(io: IOServer) {
  const nameKey = state.currentPlayer?.name.trim();
  const enriched = nameKey ? state.fullPlayerDataMap[nameKey] ?? {} : {};
  const fullPlayer = { ...state.currentPlayer, ...enriched };

  io.emit("initPlayer", fullPlayer);
  io.emit("showPlayer", fullPlayer);
}

function handlePlayerPassed(io: IOServer) {
  if (state.currentPlayer) {
    state.passedPlayers.push(state.currentPlayer);
    io.emit("playerPassedListUpdate", state.passedPlayers.map((p) => p.name));
  }

  if (state.playerQueue.length === 0) {
    if (!state.isRetryingPassed) {
      state.playerQueue = [...state.passedPlayers];
      state.isRetryingPassed = true;
    } else {
      io.emit("auctionEnd");
      return;
    }
  }

  state.currentPlayer = state.playerQueue.shift() ?? null;
  if (!state.currentPlayer) {
    io.emit("auctionEnd");
    return;
  }
  emitCurrentPlayer(io);
  startBidding(io);
}

function startCountdown(io: IOServer) {
  let count = 5;
  state.countdownTimer = setInterval(() => {
    io.emit("countdown", { count });

    if (count === 0) {
      clearInterval(state.countdownTimer!);
      io.emit("countdown", { count: "" });

      state.currentPlayer = state.playerQueue.shift() ?? null;
      if (!state.currentPlayer) {
        io.emit("countdown", { count: "모든 플레이어 경매 완료!" });
        return;
      }

      emitCurrentPlayer(io);
      startBidding(io);
    }

    count -= 1;
  }, 1000);
}

function startBidding(io: IOServer) {
  state.currentBid = 0;
  state.currentBidder = null;
  state.remainingTime = 15;

  io.emit("startBidding");

  clearInterval(state.biddingTimer!);
  state.biddingTimer = setInterval(() => {
    state.remainingTime -= 1;
    io.emit("tick", { remainingTime: state.remainingTime });

    if (state.remainingTime <= 0) {
      clearInterval(state.biddingTimer!);

      if (!state.currentBidder) {
        io.emit("playerPassed", {
          id: state.currentPlayer?.id,
          name: state.currentPlayer?.name,
        });
        handlePlayerPassed(io);
      } else {
        const team = state.currentBidder;
        const player = state.currentPlayer!;
        const bid = state.currentBid;

        state.teamPlayers[team] ??= [];
        state.teamPlayers[team].push(player);
        state.userPoints[team] -= bid;

        state.bidHistory[team] = (state.bidHistory[team] || 0) + bid;
        state.historyEntries.push({ player, team, bid });

        emitAuctionSync(io);

        io.emit("playerDrafted", {
          id: player.id,
          name: player.name,
        });

        if (state.playerQueue.length === 0 && state.passedPlayers.length === 0 && state.isRetryingPassed) {
          io.emit("auctionEnd");
        } else {
          state.currentPlayer = state.playerQueue.shift() ?? null;
          if (state.currentPlayer) {
            emitCurrentPlayer(io);
            startBidding(io);
          }
        }
      }
    }
  }, 1000);
}

io.on("connection", (socket) => {
  socket.on("join", async ({ userId, role, team }) => {
    state.userSocketMap[userId] = socket.id;
    state.userPoints[userId] ??= 1000;
    state.teamPlayers[userId] ??= [];
    state.connectedUsers[userId] = { role, team };

    state.fullPlayerDataMap = await getAllPlayerStats();

    io.emit("userListUpdate", state.connectedUsers);
  });

  socket.on("reconfirmJoin", ({ userId, role, team }) => {
    state.userSocketMap[userId] = socket.id;
    state.userPoints[userId] ??= 1000;
    state.teamPlayers[userId] ??= [];
    state.connectedUsers[userId] = { role, team };

    io.emit("userJoined", { userId, role, team });
    io.emit("userListUpdate", state.connectedUsers);
  });

  socket.on("startAuction", () => {
    clearInterval(state.countdownTimer!);
    clearInterval(state.biddingTimer!);

    state.playerQueue = shuffleArray([...PLAYERS]);
    state.passedPlayers = [];
    state.currentPlayer = null;
    state.teamPlayers = {};
    state.bidHistory = {};
    state.historyEntries = [];
    state.isRetryingPassed = false;

    emitAuctionSync(io);
    startCountdown(io);
  });

  socket.on("nextPlayer", () => {
    clearInterval(state.countdownTimer!);
    clearInterval(state.biddingTimer!);

    state.currentPlayer = state.playerQueue.shift() ?? null;
    if (!state.currentPlayer) {
      io.emit("countdown", { count: "모든 플레이어 경매 완료!" });
      return;
    }

    emitCurrentPlayer(io);
    startBidding(io);
  });

  socket.on("bid", ({ userId, bid }) => {
    const point = state.userPoints[userId] ?? 0;
    if (bid > point) {
      socket.emit("bidRejected", { reason: "포인트 부족" });
      return;
    }

    state.currentBid = bid;
    state.currentBidder = userId;
    state.remainingTime = 15;

    io.emit("updateBid", {
      bid,
      userId,
      currentPlayer: state.currentPlayer,
    });

    io.emit("pointUpdate", {
      userId,
      point: point - bid,
    });
  });

  socket.on("requestInit", ({ userId }) => {
    const socketId = state.userSocketMap[userId];

    if (!socketId) {
      console.warn("❌ socketId 없음! userSocketMap에 등록 안 됨");
      return;
    }

    io.to(socketId).emit("auctionSync", {
      teams: state.teamPlayers,
      bidHistory: state.bidHistory,
      history: state.historyEntries,
    });

    io.to(socketId).emit("userListUpdate", state.connectedUsers);

    if (state.currentPlayer) {
      const enriched = state.fullPlayerDataMap[state.currentPlayer.name] ?? {};
      const fullPlayer = { ...state.currentPlayer, ...enriched };
      io.to(socketId).emit("initPlayer", fullPlayer);
    }

    io.to(socketId).emit("playerPassedListUpdate", state.passedPlayers.map((p) => p.name));
  });

  socket.on("resetAuction", () => {
    clearInterval(state.countdownTimer!);
    clearInterval(state.biddingTimer!);

    state.playerQueue = [...PLAYERS];
    state.passedPlayers = [];
    state.currentPlayer = null;
    state.currentBid = 0;
    state.currentBidder = null;
    state.biddingTimer = null;
    state.countdownTimer = null;
    state.teamPlayers = {};
    state.bidHistory = {};
    state.historyEntries = [];
    state.remainingTime = 0;
    state.isRetryingPassed = false;

    emitAuctionSync(io);
    io.emit("auctionReset");
    io.emit("playerPassedListUpdate", []);
  });
});

app.use(cors());
app.get("/", (_: Request, res: Response) => {
  res.send("✅ Socket.io server running!");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
