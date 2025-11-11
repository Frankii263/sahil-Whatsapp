// server.js
import express from "express";
import fs from "fs";
import path from "path";
import Pino from "pino";
import { makeWASocket, useMultiFileAuthState, delay } from "@whiskeysockets/baileys";
import qrcode from "qrcode";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = 3000;
const SESSION_FOLDER = path.join("./auth_info");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER, { recursive: true });

let sock;
let messages = [];
let targets = [];
let groups = [];
let intervalTime = 5;
let groupListCache = {};

// ======== HTML ROUTE ========
app.get("/", async (req, res) => {
  // Show QR + form
  let qrImage = "";
  const qrHtml = `<div id="qr" style="margin-bottom:20px;">${qrImage}</div>`;

  const groupsHtml = Object.keys(groupListCache).length
    ? Object.keys(groupListCache).map((uid, i) => `<li>${i + 1}. ${groupListCache[uid].subject} (UID: ${uid})</li>`).join("")
    : "<li>No groups fetched yet</li>";

  res.send(`
  <html>
    <body>
      <h2>WhatsApp Web Pairing</h2>
      ${qrHtml}
      <form method="POST" action="/start">
        <h3>Send Options</h3>
        Target Numbers (comma separated): <input type="text" name="targets"/><br/>
        Groups UID (comma separated, check below): <input type="text" name="groups"/><br/>
        Messages File Path: <input type="text" name="file"/><br/>
        Delay (seconds): <input type="number" name="delay" value="5"/><br/>
        <button type="submit">Start Sending</button>
      </form>
      <h3>Available Groups:</h3>
      <ul>${groupsHtml}</ul>
    </body>
  </html>
  `);
});

// ======== START SENDING ========
app.post("/start", async (req, res) => {
  targets = req.body.targets ? req.body.targets.split(",").map(t => t.trim()) : [];
  groups = req.body.groups ? req.body.groups.split(",").map(g => g.trim()) : [];
  intervalTime = parseInt(req.body.delay) || 5;

  if (!req.body.file || !fs.existsSync(req.body.file)) return res.send("Invalid message file path!");

  messages = fs.readFileSync(req.body.file, "utf-8").split("\n").filter(Boolean);

  res.send(" Message sending started! Check terminal for logs.");

  sendMessages();
});

// ======== CONNECT TO WHATSAPP ========
const connectToWhatsApp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

  sock = makeWASocket({
    logger: Pino({ level: "silent" }),
    auth: state,
  });

  sock.ev.on("connection.update", async (update) => {
    const { qr, connection } = update;
    if (qr) {
      // Save QR as data URL
      const qrDataUrl = await qrcode.toDataURL(qr);
      console.log("Scan this QR in your browser:");
      console.log(qrDataUrl);
    }
    if (connection === "open") {
      console.log(" WhatsApp connected!");
      // Fetch all groups
      const groupsList = await sock.groupFetchAllParticipating();
      groupListCache = groupsList;
      console.log("Available groups:");
      Object.keys(groupsList).forEach((uid, i) => console.log(`${i + 1}. ${groupsList[uid].subject} (UID: ${uid})`));
    }
  });

  sock.ev.on("creds.update", saveCreds);
};

// ======== MESSAGE LOOP ========
const sendMessages = async () => {
  if (!sock) return console.log("Socket not connected!");
  while (true) {
    try {
      for (let msg of messages) {
        for (let t of targets) {
          await sock.sendMessage(t + "@c.us", { text: msg });
          console.log(`Sent to ${t}: ${msg}`);
        }
        for (let g of groups) {
          await sock.sendMessage(g + "@g.us", { text: msg });
          console.log(`Sent to group ${g}: ${msg}`);
        }
        await delay(intervalTime * 1000);
      }
    } catch (err) {
      console.log("Error sending messages, retrying in 5s...", err.message);
      await delay(5000);
    }
  }
};

// ======== RUN SERVER ========
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await connectToWhatsApp();
});