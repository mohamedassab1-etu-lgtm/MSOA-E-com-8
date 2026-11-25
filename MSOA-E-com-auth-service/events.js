const { Kafka, logLevel } = require("kafkajs");
const { randomUUID } = require("crypto");

const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || "users";
const KAFKA_ENABLED = process.env.KAFKA_ENABLED !== "false";

const kafka = new Kafka({
  clientId: "auth-service",
  brokers: [KAFKA_BROKER],
  logLevel: logLevel.NOTHING,
  retry: { retries: 2 },
});
const producer = kafka.producer();
let connected = false;

async function publishUserEvent(type, user) {
  if (!KAFKA_ENABLED) return;
  const event = {
    eventId: `evt-${randomUUID()}`,
    type,
    userId: user.id,
    role: user.role,
    occurredAt: new Date().toISOString(),
    source: "auth-service",
  };
  try {
    if (!connected) {
      await producer.connect();
      connected = true;
    }
    await producer.send({
      topic: KAFKA_TOPIC,
      messages: [{ key: user.id, value: JSON.stringify(event) }],
    });
  } catch (err) {
    connected = false;
    console.error("Kafka indisponible, événement non envoyé :", err.message);
  }
}

module.exports = { publishUserEvent };