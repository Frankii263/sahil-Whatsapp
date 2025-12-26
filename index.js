import { Boom } from "@hapi/boom";
import fs from "fs";
import pino from "pino";
import readline from "readline";
import {
  makeWASocket,
  useMultiFileAuthState,
  delay,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
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

  // State initialization
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
  const { version } = await fetchLatestBaileysVersion();

  let targetNumbers = [];
  let groupUIDs = [];
  let messages = null;
  let intervalTime = null;
  let haterName = null;
  let lastSentIndex = 0;
  let autoSendEnabled = false;

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
      version,
      logger: pino({ level: "silent" }),
      auth: {
        creds: state.creds,
        // Cacheable store helps in preventing "Bad MAC" errors
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      browser: ["Chrome (Linux)", "", ""], 
      markOnlineOnConnect: false,
      syncFullHistory: false,
      printQRInTerminal: false
    });

    if (!sock.authState.creds.registered) {
      clearScreen();
      const phoneNumber = await question(`${green}[+] Enter Your Phone Number (with Country Code) => ${reset}`);
      const cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
      
      console.log(`${yellow}[*] Requesting Pairing Code...${reset}`);
      await delay(5000); // Wait for socket to stabilize

      try {
        const pairingCode = await sock.requestPairingCode(cleanedNumber);
        clearScreen();
        console.log(`${green}============================================`);
        console.log(`${green}[√] YOUR PAIRING CODE IS => ${reset}${pairingCode}`);
        console.log(`${green}============================================${reset}`);
      } catch (err) {
        console.log(`${yellow}Error: ${err.message}${reset}`);
        process.exit(1);
      }
    }

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        clearScreen();
        console.log(`${green}[Your WhatsApp Login ✓]${reset}`);

        if (!messages) {
          const sendOption = await question(`${green}[1] Send to Numbers\n[2] Send to Groups\nChoose => ${reset}`);
          if (sendOption === "1") {
            const num = await question(`${green}[+] How Many Numbers? => ${reset}`);
            for (let i = 0; i < num; i++) {
              const t = await question(`${green}[+] Number ${i + 1} => ${reset}`);
              targetNumbers.push(t.replace(/[^0-9]/g, ''));
            }
          } else if (sendOption === "2") {
            const groupList = await sock.groupFetchAllParticipating();
            Object.keys(groupList).forEach((uid, i) => {
              console.log(`${green}[${i + 1}] ${groupList[uid].subject} (${uid})`);
            });
            const num = await question(`${green}[+] How Many Groups? => ${reset}`);
            for (let i = 0; i < num; i++) {
              const g = await question(`${green}[+] Group UID ${i + 1} => ${reset}`);
              groupUIDs.push(g);
            }
          }

          const path = await question(`${green}[+] Message File Path => ${reset}`);
          messages = fs.readFileSync(path, "utf-8").split("\n").filter(Boolean);
          haterName = await question(`${green}[+] Hater Name => ${reset}`);
          intervalTime = await question(`${green}[+] Delay (sec) => ${reset}`);

          clearScreen();
          sendMessages(sock);
        } else {
          sendMessages(sock);
        }
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (reason === DisconnectReason.loggedOut) {
          fs.rmSync("./auth_info", { recursive: true, force: true });
          process.exit(0);
        } else {
          connectToWhatsApp();
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);
  };

  await connectToWhatsApp();
})();
