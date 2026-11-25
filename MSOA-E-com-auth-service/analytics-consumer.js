require("dotenv").config();
const { Kafka, logLevel } = require("kafkajs");

const BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const TOPIC = process.env.KAFKA_TOPIC || "users";
const GROUP = process.env.ANALYTICS_GROUP || "analytics";

const kafka = new Kafka({
  clientId: "analytics-service",
  brokers: [BROKER],
  logLevel: logLevel.NOTHING,
});
const consumer = kafka.consumer({ groupId: GROUP });

const counts = {};
const seen = new Set();

async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message }) => {
      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch {
        console.error("Message invalide ignoré");
        return;
      }
      if (seen.has(event.eventId)) return;
      seen.add(event.eventId);
      counts[event.type] = (counts[event.type] || 0) + 1;
      console.log(`[offset ${message.offset}] ${event.type} user=${event.userId}`);
      console.log("Totaux :", counts);
    },
  });
}

run().catch((err) => {
  console.error("Erreur Analytics :", err.message);
  process.exit(1);
});