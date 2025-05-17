// lib/winrate.ts
import { connectToDB } from "./mongodb";
import { PLAYERS } from "./players";

export async function getAllPlayerStats() {
  const client = await connectToDB();
  const db = client.db("내전GG");

  const playerStats: Record<string, any> = {};

  // players 컬렉션 기반 alias → nicknames map 만들기
  const aliasDocs = await db.collection("players").find().toArray();
  const aliasToNicknames: Record<string, string[]> = {};
  for (const doc of aliasDocs) {
    aliasToNicknames[doc.alias] = doc.nicknames;
  }

  const allMatches = await db.collection("matches").find().toArray();

  for (const player of PLAYERS) {
    const alias = player.name; // PLAYERS는 alias 기준으로 구성됨
    const nicknameList = aliasToNicknames[alias] ?? [alias];

    const relevantMatches = allMatches.filter((match:any) => {
      const year = new Date(match.gameDate).getFullYear();
      if (year !== 2025) return false;
      return match.participants?.some((p: any) => nicknameList.includes(p.name));
    });

    const totalGames = relevantMatches.length;
    const winGames = relevantMatches.filter((match:any) => {
      const participant = match.participants.find((p: any) => nicknameList.includes(p.name));
      const winField = participant?.win;
      return winField === "Win" || winField === true || winField?.toLowerCase?.() === "win";
    }).length;

    const winrateOverall = totalGames > 0 ? Math.round((winGames / totalGames) * 100) : null;

    const lanes = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
    const winrateByLane: Record<string, number | null> = {};
    const laneGamesCount: Record<string, number> = {};

    for (const lane of lanes) {
      const laneGames = relevantMatches.filter((match:any) => {
        const participant = match.participants.find(
          (p: any) => nicknameList.includes(p.name) && p.position?.toUpperCase() === lane
        );
        return !!participant;
      });

      const laneWins = laneGames.filter((match:any) => {
        const participant = match.participants.find(
          (p: any) => nicknameList.includes(p.name) && p.position?.toUpperCase() === lane
        );
        const winField = participant?.win;
        return winField === "Win" || winField === true || winField?.toLowerCase?.() === "win";
      }).length;

      const key = lane.toLowerCase();
      winrateByLane[key] = laneGames.length > 0 ? Math.round((laneWins / laneGames.length) * 100) : null;
      laneGamesCount[key] = laneGames.length;
    }

    playerStats[alias] = {
      winrateOverall,
      totalGames,
      winrateByLane,
      laneGamesCount,
    };

    // 별명으로도 접근 가능하게 추가
    for (const nick of nicknameList) {
      playerStats[nick] = playerStats[alias];
    }
  }

  return playerStats;
}
