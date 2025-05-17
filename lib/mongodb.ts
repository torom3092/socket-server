import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;
const client = new MongoClient(uri);
let db: any;

export async function connectToDB() {
  if (!db) {
    await client.connect(); // 연결
    db = client.db("내전GG"); // DB 이름
  }
  return client;
}
