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

// -------------------- 상태 --------------------

const PLAYERS = [
  { id: "1", name: "문어남자" },
  { id: "2", name: "감자" },
  { id: "3", name: "서해주" },
  // 필요한 플레이어 목록 추가
];

type PlayerBasic = (typeof PLAYERS)[number];

const state = {
  playerQueue: [...PLAYERS],
  passedPlayers: [] as PlayerBasic[],
  currentPlayer: null as PlayerBasic | null,
  currentBid: 0,
  remainingTime: 0,
  currentBidder: null as string | null,
  biddingTimer: null as NodeJS.Timeout | null,
  teamPlayers: {} as Record<string, PlayerBasic[]>,
  bidHistory: {} as Record<string, number>,
  historyEntries: [] as { player: PlayerBasic; team: string; bid: number }[],
  userPoints: {} as Record<string, number>,
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

function emitCurrentPlayer() {
  if (state.currentPlayer) {
    io.emit("showPlayer", state.currentPlayer);
  }
}

function startBidding() {
  state.currentBid = 0;
  state.currentBidder = null;
  state.remainingTime = 15;

  io.emit("startBidding");

  state.biddingTimer = setInterval(() => {
    state.remainingTime -= 1;
    io.emit("tick", { remainingTime: state.remainingTime });

    if (state.remainingTime <= 0) {
      clearInterval(state.biddingTimer!);

      if (!state.currentBidder) {
        io.emit("playerPassed", state.currentPlayer);
        state.passedPlayers.push(state.currentPlayer!);
        io.emit(
          "playerPassedListUpdate",
          state.passedPlayers.map((p) => p.name)
        );
      } else {
        const player = state.currentPlayer!;
        const team = state.currentBidder;
        const bid = state.currentBid;

        state.teamPlayers[team] ??= [];
        state.teamPlayers[team].push(player);
        state.userPoints[team] = (state.userPoints[team] ?? 1000) - bid;
        state.bidHistory[team] = (state.bidHistory[team] || 0) + bid;
        state.historyEntries.push({ player, team, bid });

        io.emit("playerDrafted", player);
      }

      state.currentPlayer = null;

      handleNextPlayer();
    }
  }, 1000);
}

function handleNextPlayer() {
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
  if (state.currentPlayer) {
    emitCurrentPlayer();
    startBidding();
  }
}

// -------------------- 소켓 이벤트 --------------------

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("startAuction", () => {
    console.log("🎯 경매 시작 요청 수신");
    state.playerQueue = shuffleArray([...PLAYERS]);
    state.passedPlayers = [];
    state.isRetryingPassed = false;
    state.currentPlayer = null;
    handleNextPlayer();
  });

  socket.on("bid", ({ userId, amount }) => {
    const point = state.userPoints[userId] ?? 1000;
    if (amount > point) {
      socket.emit("bidRejected", { reason: "포인트 부족" });
      return;
    }

    state.currentBid = amount;
    state.currentBidder = userId;
    state.remainingTime = 15;

    io.emit("updateBid", {
      bid: amount,
      userId,
      currentPlayer: state.currentPlayer,
    });
  });

  socket.on("resetAuction", () => {
    state.playerQueue = [...PLAYERS];
    state.passedPlayers = [];
    state.currentPlayer = null;
    state.currentBid = 0;
    state.currentBidder = null;
    state.remainingTime = 0;
    state.isRetryingPassed = false;
    state.bidHistory = {};
    state.teamPlayers = {};
    state.historyEntries = [];
    state.userPoints = {};
    clearInterval(state.biddingTimer!);

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
