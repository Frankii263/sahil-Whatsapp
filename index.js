import { Boom } from "@hapi/boom";
import fs from "fs";
import path from "path";
import pino from "pino";
import readline from "readline";
import {
  makeWASocket,
  useMultiFileAuthState,
  delay,
  DisconnectReason
} from "@whiskeysockets/baileys";

// =================== FOLDER AUTO CREATE ===================
const sessionFolder = path.join("./auth_info");
if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });

// =================== CLI SETUP ===================
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise(resolve => rl.question(text, resolve));

const reset = "\x1b[0m";
const green = "\x1b[1;32m";
const yellow = "\x1b[1;33m";

const logo = `${green}
 __    __ _           _                         
/ /\\ /\\ \\ |__   __ _| |_ ___  __ _ _ __  _ __  
\\ \\/  \\/ / '_ \\ / _\` | __/ __|/ _\` | '_ \\| '_ \\ 
 \\  /\\  /| | | | (_| | |\\__ \\ (_| | |_) | |_) |
  \\/  \\/ |_| |_|\\__,_|\\__|___/\\__,_| .__/| .__/ 
                                   |_|   |_|    
============================================
[~] Author  : SAHIL KHAN 
[~] Tool    : WHATSAPP OFFLINE SERVER 
============================================`;

const clearScreen = () => { console.clear(); console.log(logo); };

// =================== GLOBAL VARS ===================
let targetNumbers = [];
let groupUIDs = [];
let messages = null;
let intervalTime = null;
let haterName = null;
let lastSentIndex = 0;
let autoSendEnabled = false;

// =================== MAIN MESSAGE SENDER ===================
async function sendMessages(sock) {
  if (autoSendEnabled) return;
  autoSendEnabled = true;

  while (autoSendEnabled) {
    for (let i = lastSentIndex; i < messages.length; i++) {
      try {
        const fullMessage = `${haterName} ${messages[i]}`;
        const currentTime = new Date().toLocaleTimeString();

        if (targetNumbers.length > 0) {
          for (const num of targetNumbers) {
            await sock.sendMessage(num + "@c.us", { text: fullMessage });
            console.log(`${green}Target =>${reset} ${num}`);
          }
        } else {
          for (const gid of groupUIDs) {
            await sock.sendMessage(gid + "@g.us", { text: fullMessage });
            console.log(`${green}Group =>${reset} ${gid}`);
          }
        }

        console.log(`${green}Time =>${reset} ${currentTime}`);
        console.log(`${green}Message =>${reset} ${fullMessage}`);
        console.log("    [ =============== SAHIL WP LOADER =============== ]");

        await delay(intervalTime * 1000);
      } catch (err) {
        console.log(`${yellow}Error sending message: ${err.message}. Retrying...${reset}`);
        lastSentIndex = i;
        await delay(5000);
      }
    }
    lastSentIndex = 0;
  }
}

// =================== CONNECT FUNCTION ===================
const connectToWhatsApp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state
  });

  // =================== PAIRING ===================
  if (!sock.authState.creds.registered) {
    clearScreen();
    const phoneNumber = await question(`${green}[+] Enter Your Phone Number (e.g. 923001234567) => ${reset}`);
    try {
      const code = await sock.requestPairingCode(phoneNumber.trim());
      clearScreen();
      console.log(`${green}[] Your Pairing Code =>${reset} ${code}`);
      console.log(`${yellow} Go to WhatsApp > Linked Devices > Pair with phone number${reset}`);
    } catch (e) {
      console.log(`${yellow}[X] Pairing failed: ${e.message}${reset}`);
      process.exit(0);
    }
  }

  // =================== CONNECTION UPDATE ===================
  sock.ev.on("connection.update", async update => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      clearScreen();
      console.log(`${green}[] Connected to WhatsApp!${reset}`);

      if (!messages) {
        const sendOption = await question(
          `${green}[1] Send to Target Number\n[2] Send to WhatsApp Group\nChoose Option => ${reset}`
        );

        if (sendOption === "1") {
          const numTargets = await question(`${green}[+] How Many Target Numbers? => ${reset}`);
          for (let i = 0; i < numTargets; i++) {
            const num = await question(`${green}[+] Enter Target Number ${i + 1} => ${reset}`);
            targetNumbers.push(num);
          }
        } else if (sendOption === "2") {
          const groupList = await sock.groupFetchAllParticipating();
          const groupUIDsList = Object.keys(groupList);
          console.log(`${green}[] WhatsApp Groups =>${reset}`);
          groupUIDsList.forEach((uid, i) => console.log(`${green}[${i+1}]${reset} ${groupList[uid].subject} UID:${uid}`));

          const numGroups = await question(`${green}[+] How Many Groups to Target => ${reset}`);
          for (let i = 0; i < numGroups; i++) {
            const gid = await question(`${green}[+] Enter Group UID ${i + 1} => ${reset}`);
            groupUIDs.push(gid);
          }
        }

        const filePath = await question(`${green}[+] Enter Message File Path => ${reset}`);
        messages = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);

        haterName = await question(`${green}[+] Enter Hater Name => ${reset}`);
        intervalTime = await question(`${green}[+] Enter Message Delay (seconds) => ${reset}`);

        clearScreen();
        console.log(`${green}Starting Message Sending...${reset}`);
        sendMessages(sock);
      } else {
        console.log(`${green}[Auto Resume] Resuming messages...${reset}`);
        sendMessages(sock);
      }
    }

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log(`${yellow}[!] Session expired. Please pair again.${reset}`);
        process.exit(0);
      } else {
        console.log(`${yellow}[!] Connection lost. Reconnecting in 5 sec...${reset}`);
        autoSendEnabled = false;
        setTimeout(async () => {
          const newSock = await connectToWhatsApp();
          if (messages) {
            console.log(`${green}[Auto Resume] Internet back, resuming...${reset}`);
            sendMessages(newSock);
          }
        }, 5000);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
  return sock;
};

// =================== RUN ===================
(async () => {
  await connectToWhatsApp();

  process.on("uncaughtException", err => {
    const e = String(err);
    if (e.includes("Socket connection timeout") || e.includes("rate-overlimit")) return;
    console.log("Caught exception: ", err);
  });
})();