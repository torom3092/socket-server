"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToDB = connectToDB;
const mongodb_1 = require("mongodb");
const uri = process.env.MONGODB_URI;
const client = new mongodb_1.MongoClient(uri);
let db;
async function connectToDB() {
    if (!db) {
        await client.connect(); // 연결
        db = client.db("내전GG"); // DB 이름
    }
    return client;
}
