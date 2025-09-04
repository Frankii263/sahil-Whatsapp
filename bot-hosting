import { Boom } from "@hapi/boom";
import fs from "fs";
import pino from "pino";
import readline from "readline";
import {
  makeWASocket,
  useMultiFileAuthState,
  delay,
  DisconnectReason
} from "@whiskeysockets/baileys";

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (text) => new Promise((resolve) => rl.question(text, resolve));

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

  const clearScreen = () => {
    console.clear();
    console.log(logo);
  };

  let targetNumbers = [];
  let groupUIDs = [];
  let messages = null;
  let intervalTime = null;
  let haterName = null;
  let lastSentIndex = 0;
  let autoSendEnabled = false;

  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

  async function sendMessages(sock) {
    autoSendEnabled = true;
    while (autoSendEnabled) {
      for (let i = lastSentIndex; i < messages.length; i++) {
        try {
          const currentTime = new Date().toLocaleTimeString();
          const fullMessage = `${haterName} ${messages[i]}`;

          if (targetNumbers.length > 0) {
            for (const targetNumber of targetNumbers) {
              await sock.sendMessage(targetNumber + "@c.us", { text: fullMessage });
              console.log(`${green}Target Number => ${reset}${targetNumber}`);
            }
          } else {
            for (const groupUID of groupUIDs) {
              await sock.sendMessage(groupUID + "@g.us", { text: fullMessage });
              console.log(`${green}Group UID => ${reset}${groupUID}`);
            }
          }

          console.log(`${green}Time => ${reset}${currentTime}`);
          console.log(`${green}Message => ${reset}${fullMessage}`);
          console.log("    [ =============== SAHIL  WP LOADER =============== ]");

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

  const connectToWhatsApp = async () => {
    const sock = makeWASocket({
      logger: pino({ level: "silent" }),
      auth: state
    });

    if (!sock.authState.creds.registered) {
      clearScreen();
      const phoneNumber = await question(`${green}[+] Enter Your Phone Number => ${reset}`);
      const pairingCode = await sock.requestPairingCode(phoneNumber);
      clearScreen();
      console.log(`${green}[√] Your Pairing Code Is => ${reset}${pairingCode}`);
    }

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        clearScreen();
        console.log(`${green}[Your WhatsApp Login ✓]${reset}`);

        if (!messages) {
          const sendOption = await question(
            `${green}[1] Send to Target Number\n[2] Send to WhatsApp Group\nChoose Option => ${reset}`
          );

          if (sendOption === "1") {
            const numberOfTargets = await question(`${green}[+] How Many Target Numbers? => ${reset}`);
            for (let i = 0; i < numberOfTargets; i++) {
              const targetNumber = await question(`${green}[+] Enter Target Number ${i + 1} => ${reset}`);
              targetNumbers.push(targetNumber);
            }
          } else if (sendOption === "2") {
            const groupList = await sock.groupFetchAllParticipating();
            const groupUIDsList = Object.keys(groupList);

            console.log(`${green}[√] WhatsApp Groups =>${reset}`);
            groupUIDsList.forEach((uid, index) => {
              console.log(`${green}[${index + 1}] Group Name: ${reset}${groupList[uid].subject} ${green}UID: ${reset}${uid}`);
            });

            const numberOfGroups = await question(`${green}[+] How Many Groups to Target => ${reset}`);
            for (let i = 0; i < numberOfGroups; i++) {
              const groupUID = await question(`${green}[+] Enter Group UID ${i + 1} => ${reset}`);
              groupUIDs.push(groupUID);
            }
          }

          const messageFilePath = await question(`${green}[+] Enter Message File Path => ${reset}`);
          messages = fs.readFileSync(messageFilePath, "utf-8").split("\n").filter(Boolean);

          haterName = await question(`${green}[+] Enter Hater Name => ${reset}`);
          intervalTime = await question(`${green}[+] Enter Message Delay (seconds) => ${reset}`);

          console.log(`${green}All Details Are Filled Correctly${reset}`);
          clearScreen();
          console.log(`${green}Now Start Message Sending.......${reset}`);
          console.log("      [ =============== SAHIL KHAN WP LOADER =============== ]\n");

          sendMessages(sock);
        } else {
          console.log(`${green}[Auto Resume] Resuming message sending...${reset}`);
          sendMessages(sock);
        }
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

        if (reason === DisconnectReason.loggedOut) {
          console.log(`${yellow}[!] Session Expired, Please Pair Again${reset}`);
          process.exit(0);
        } else {
          console.log(`${yellow}[!] Connection Lost, Reconnecting in 5 sec...${reset}`);
          setTimeout(async () => {
            const newSock = await connectToWhatsApp();
            if (messages) {
              console.log(`${green}[Auto Resume] Internet back, resuming message sending...${reset}`);
              sendMessages(newSock);
            }
          }, 5000);
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);
    return sock;
  };

  await connectToWhatsApp();

  process.on("uncaughtException", function (err) {
    let e = String(err);
    if (e.includes("Socket connection timeout") || e.includes("rate-overlimit")) return;
    console.log("Caught exception: ", err);
  });
})();
