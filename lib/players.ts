export interface PlayerBasic {
  id: string;
  name: string;
  tierCurrent: string;
  tierPeak: string;
}

export const PLAYERS: PlayerBasic[] = [
  { id: "P1", name: "그카", tierCurrent: "다이아1", tierPeak: "그마" },
  { id: "P2", name: "김곤이", tierCurrent: "브론즈2", tierPeak: "플레3" },
  { id: "P3", name: "문어남자", tierCurrent: "플레4", tierPeak: "에메4" },
  { id: "P4", name: "유미집사", tierCurrent: "플레1", tierPeak: "다이아3" },
  { id: "P5", name: "제니", tierCurrent: "플레3", tierPeak: "에메4" },
  { id: "P6", name: "현또박", tierCurrent: "에메4", tierPeak: "다이아승격전" },
  { id: "P7", name: "wisp", tierCurrent: "마스터", tierPeak: "마스터" },
  { id: "P8", name: "조매쉬", tierCurrent: "골드2", tierPeak: "플레2" },
  { id: "P9", name: "고전퐈", tierCurrent: "다이아4", tierPeak: "언랭랭" },
  { id: "P10", name: "감자", tierCurrent: "에메3", tierPeak: "다이아2" },
  { id: "P11", name: "없턴", tierCurrent: "플레4", tierPeak: "플레4" },
  { id: "P12", name: "비니", tierCurrent: "골드1", tierPeak: "플레1" },
  { id: "P13", name: "콩알몬", tierCurrent: "골드4", tierPeak: "에메3" },
  { id: "P14", name: "서해주", tierCurrent: "골드4", tierPeak: "에메4" },
  { id: "P15", name: "나왔니요", tierCurrent: "언랭", tierPeak: "골드2" },
  { id: "P16", name: "대현철", tierCurrent: "에메2", tierPeak: "마스터" },
];
