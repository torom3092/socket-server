import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import { PLAYERS, PlayerBasic } from "./lib/players";
// import { getAllPlayerStats } from "./lib/winrate";

const app = express();
app.use(cors());

const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*" },
});

// 서버 상태
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

function emitAuctionSync() {
  const payload = {
    syncedTeams: state.teamPlayers,
    syncedBids: state.bidHistory,
    syncedHistory: state.historyEntries,
  };
  io.emit("auctionSync", payload);
  io.emit("teamPanelSync", payload);
}

function emitCurrentPlayer() {
  const nameKey = state.currentPlayer?.name.trim();
  const enriched = nameKey ? state.fullPlayerDataMap[nameKey] ?? {} : {};
  const fullPlayer = { ...state.currentPlayer, ...enriched };
  io.emit("initPlayer", fullPlayer);
  io.emit("showPlayer", fullPlayer);
}

function handlePlayerPassed() {
  if (state.currentPlayer) {
    state.passedPlayers.push(state.currentPlayer);
    io.emit(
      "playerPassedListUpdate",
      state.passedPlayers.map((p) => p.name)
    );
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
  emitCurrentPlayer();
  startBidding();
}

function startCountdown() {
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

      emitCurrentPlayer();
      startBidding();
    }

    count -= 1;
  }, 1000);
}

function startBidding() {
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
        handlePlayerPassed();
      } else {
        const team = state.currentBidder;
        const player = state.currentPlayer!;
        const bid = state.currentBid;

        state.teamPlayers[team] ??= [];
        state.teamPlayers[team].push(player);
        state.userPoints[team] -= bid;

        state.bidHistory[team] = (state.bidHistory[team] || 0) + bid;
        state.historyEntries.push({ player, team, bid });

        emitAuctionSync();

        io.emit("playerDrafted", {
          id: player.id,
          name: player.name,
        });

        if (state.playerQueue.length === 0 && state.passedPlayers.length === 0 && state.isRetryingPassed) {
          io.emit("auctionEnd");
        } else {
          state.currentPlayer = state.playerQueue.shift() ?? null;
          if (state.currentPlayer) {
            emitCurrentPlayer();
            startBidding();
          }
        }
      }
    }
  }, 1000);
}

io.on("connection", (socket) => {
  socket.on("join", async ({ userId, role, team, fullPlayerDataMap }) => {
    state.userSocketMap[userId] = socket.id;
    state.userPoints[userId] ??= 1000;
    state.teamPlayers[userId] ??= [];
    state.connectedUsers[userId] = { role, team };
    state.fullPlayerDataMap = fullPlayerDataMap;

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

    emitAuctionSync();
    startCountdown();
  });

  socket.on("nextPlayer", () => {
    clearInterval(state.countdownTimer!);
    clearInterval(state.biddingTimer!);

    state.currentPlayer = state.playerQueue.shift() ?? null;
    if (!state.currentPlayer) {
      io.emit("countdown", { count: "모든 플레이어 경매 완료!" });
      return;
    }

    emitCurrentPlayer();
    startBidding();
  });

  socket.on("bid", ({ userId, bid }) => {
    const point = state.userPoints[userId] ?? 0;

    // 플레이어가 없으면 무시
    if (!state.currentPlayer) {
      socket.emit("bidRejected", { reason: "현재 경매 중인 플레이어가 없습니다." });
      return;
    }

    // 이미 유저가 가진 포인트보다 많은 금액이면 거절
    if (bid > point) {
      socket.emit("bidRejected", { reason: "포인트가 부족합니다." });
      return;
    }

    // 현재 입찰가보다 낮거나 같으면 거절
    if (bid <= state.currentBid) {
      socket.emit("bidRejected", { reason: "현재 입찰가보다 높은 금액을 입력해주세요." });
      return;
    }

    // 입찰 성공 처리
    state.currentBid = bid;
    state.currentBidder = userId;
    state.remainingTime = 15; // 입찰이 들어오면 시간 초기화

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
    if (!socketId) return;

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

    io.to(socketId).emit(
      "playerPassedListUpdate",
      state.passedPlayers.map((p) => p.name)
    );
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

    emitAuctionSync();
    io.emit("auctionReset");
    io.emit("playerPassedListUpdate", []);
  });
});

app.get("/", (_, res) => {
  res.send("✅ socket-server is running");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// server.listen(3001, () => {
//   console.log("🚀 로컬 개발용 소켓 서버 실행 중: http://localhost:3001");
// });
