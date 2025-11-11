import { Boom } from "@hapi/boom";
import fs from "fs";
import path from "path";
import pino from "pino";
import express from "express";
import { makeWASocket, useMultiFileAuthState, delay, DisconnectReason } from "@whiskeysockets/baileys";
import bodyParser from "body-parser";

// =================== FOLDER SETUP ===================
const sessionFolder = path.join("./auth_info");
if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });

// =================== EXPRESS SETUP ===================
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// =================== GLOBAL VARS ===================
let sock = null;
let targetNumbers = [];
let groupUIDs = [];
let messages = [];
let intervalTime = 5;
let haterName = "";
let lastSentIndex = 0;
let autoSendEnabled = false;

// =================== HTML ROUTE ===================
app.get("/", (req, res) => {
  res.send(`
    <h2>WHATSAPP OFFLINE SERVER</h2>
    <form method="POST" action="/start">
      <label>Phone Number:</label><br/>
      <input name="phone" placeholder="923001234567" required /><br/><br/>
      
      <label>Hater Name:</label><br/>
      <input name="hater" placeholder="Hater Name" required /><br/><br/>
      
      <label>Message Delay (seconds):</label><br/>
      <input name="delay" type="number" value="5" /><br/><br/>
      
      <label>Messages (one per line):</label><br/>
      <textarea name="messages" rows="5" placeholder="Message 1\nMessage 2" required></textarea><br/><br/>
      
      <label>Target Numbers (comma separated, leave empty for groups):</label><br/>
      <input name="targets" placeholder="923001234567,923009876543" /><br/><br/>
      
      <button type="submit">Start Sending</button>
    </form>
  `);
});

// =================== START SENDING ===================
app.post("/start", async (req, res) => {
  try {
    if (!sock) sock = await connectToWhatsApp();

    targetNumbers = req.body.targets ? req.body.targets.split(",").map(x => x.trim()) : [];
    messages = req.body.messages.split("\n").filter(Boolean);
    haterName = req.body.hater || "";
    intervalTime = parseInt(req.body.delay) || 5;

    res.send("<h3>Messages sending started! Check your Termux console.</h3>");
    sendMessages(sock);
  } catch (err) {
    console.log("Error:", err);
    res.send("<h3>Error starting messages. Check console.</h3>");
  }
});

// =================== MESSAGE SENDER ===================
async function sendMessages(sockInstance) {
  if (autoSendEnabled) return;
  autoSendEnabled = true;

  while (autoSendEnabled) {
    for (let i = lastSentIndex; i < messages.length; i++) {
      try {
        const fullMessage = `${haterName} ${messages[i]}`;
        const currentTime = new Date().toLocaleTimeString();

        if (targetNumbers.length > 0) {
          for (const num of targetNumbers) {
            await sockInstance.sendMessage(num + "@c.us", { text: fullMessage });
            console.log(`[Target] ${num} => ${fullMessage}`);
          }
        } else {
          for (const gid of groupUIDs) {
            await sockInstance.sendMessage(gid + "@g.us", { text: fullMessage });
            console.log(`[Group] ${gid} => ${fullMessage}`);
          }
        }

        console.log(`[Time] ${currentTime}`);
        await delay(intervalTime * 1000);
      } catch (err) {
        console.log(`[Retry] Error sending: ${err.message}`);
        lastSentIndex = i;
        await delay(5000);
      }
    }
    lastSentIndex = 0;
  }
}

// =================== CONNECT WHATSAPP ===================
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  const sockInstance = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state
  });

  sockInstance.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("[] Connected to WhatsApp!");

      // Pairing if not registered
      if (!sockInstance.authState.creds.registered) {
        const phoneNumber = await prompt("Enter Your Phone Number => ");
        try {
          const code = await sockInstance.requestPairingCode(phoneNumber.trim());
          console.log("[] Pairing Code =>", code);
          console.log(" Go to WhatsApp > Linked Devices > Pair with this number");
        } catch (e) {
          console.log("[X] Pairing failed:", e.message);
        }
      }
    }

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("[!] Session expired. Please pair again.");
        process.exit(0);
      } else {
        console.log("[!] Connection lost. Reconnecting in 5 sec...");
        autoSendEnabled = false;
        setTimeout(async () => {
          const newSock = await connectToWhatsApp();
          if (messages.length > 0) sendMessages(newSock);
        }, 5000);
      }
    }
  });

  sockInstance.ev.on("creds.update", saveCreds);
  return sockInstance;
}

// =================== HELPER PROMPT FOR CLI ===================
function prompt(text) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(text, ans => { rl.close(); resolve(ans); }));
}

// =================== RUN EXPRESS SERVER ===================
app.listen(3000, () => {
  console.log(" WhatsApp Offline Server running on http://localhost:3000");
});