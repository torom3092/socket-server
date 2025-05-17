// lib/mongodb.js
const { MongoClient } = require("mongodb");
let client;

async function connectToDB() {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
  }
  return client;
}

module.exports = { connectToDB };