import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;
const client = new MongoClient(uri);
let db: ReturnType<MongoClient["db"]> | null = null;

export async function connectToDB() {
  if (!db) {
    await client.connect();
    db = client.db("내전GG");
  }
  return client;
}
