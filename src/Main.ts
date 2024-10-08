import { Client, Thread, User } from "libfb";
import Crypto from 'crypto-js';
import chalk from "chalk";
import * as fs from "fs";
import Env from "dotenv";
import path from "path";
import In from "input";

interface Config {
     USN: string;
     PASS: string;
     KEYHASH: string;
     AUTORETRY: boolean;
     DEBUG: boolean;
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function main() {
     console.log(chalk.blue("[ Messenger Mention God ]"));

     // Used for secured credentals.
     var _keyhash = (Math.random() + 1).toString(36).substring(2);
     function loadConfig() {
          Env.config({ path: path.join(process.cwd(), ".env") });
          _keyhash = process.env["KEYHASH"] || _keyhash;
          console.log(chalk.green("Environment Variables loaded."));
     }

     if (fs.existsSync(path.join(process.cwd(), ".env"))) loadConfig()
     else {
          console.log(chalk.yellow("Environment Variables not found.") + chalk.cyan(" | Prompting for login credentials instead..."));
          while (true) {
               while (true) {
                    let usn = await In.text("Username: ");
                    if (!usn || usn.length < 1) console.log(chalk.red("Username cannot be empty."));
                    else {
                         process.env["USN"] = usn;
                         break;
                    }
               }
               while (true) {
                    let pass = await In.password("Password: ");
                    if (!pass || pass.length < 1) console.log(chalk.red("Password cannot be empty."));
                    else {
                         process.env["PASS"] = pass;
                         break;
                    }
               }
               console.log(chalk.bold("Username: ") + chalk.underline(process.env["USN"]));
               console.log(chalk.bold("Password: ") + chalk.underline.dim("*".repeat(process.env["PASS"].length)));
               let confirm = await In.confirm("We won't use your credentials for any reasons. Wish to proceed?");
               if (confirm) break;
               else process.exit(1);
          }
          let saveCred = await In.confirm("Do you want to save your credentials for later use?");
          if (saveCred) {
               const config: Config = {
                    USN: Crypto.AES.encrypt(process.env["USN"], _keyhash).toString(),
                    PASS: Crypto.AES.encrypt(process.env["PASS"], _keyhash).toString(),
                    KEYHASH: _keyhash,
                    AUTORETRY: false,
                    DEBUG: true
               }
               fs.writeFileSync(path.join(process.cwd(), ".env"), Object.entries(config).map(o => o[0] + '=' + o[1]).join('\n'), "utf-8");
               console.log(chalk.green("Credentials saved in your local environment variables."));
               loadConfig();
          }
     }

     console.log(chalk.yellow("Logging in..."));
     const client = new Client({ selfListen: false });
     await client.login(
          Crypto.AES.decrypt(process.env["USN"], _keyhash).toString(Crypto.enc.Utf8),
          Crypto.AES.decrypt(process.env["PASS"], _keyhash).toString(Crypto.enc.Utf8)
     )
          .then(() => console.log(chalk.green("Logged in.")))
          .catch(async err => {
               console.log(chalk.red("Failed to log in."))
               if (process.env["DEBUG"] == "true") console.error("[DebugErr]:", err);
               if (process.env["AUTORETRY"] == "true") {
                    console.log(chalk.yellowBright("Retrying..."));
                    await delay(4000);
               }
               else process.exit(1);
          });

     let thread: Thread, target: User, nickname: string;
     app: while (true) {
          let choice = await In.select("Select action: ", [
               { name: `Send Message ${thread ? `to '${thread.isGroup ? '[G] ' : ''}${chalk.underline.cyan(thread.name || thread.participants[0].name)}'` : ''}`, value: 0 },
               { name: "Select Thread", value: 1 },
               { name: `Select Mention User${target ? ` | Selected: ${chalk.underline.cyan(target.name)}` : ''}`, value: 2 },
               { name: "Exit App", value: 3 }
          ]);
          select: switch (choice) {
               case 0:
                    if (!thread) {
                         console.log(chalk.red("No thread is selected. Please select a thread first."));
                         break select;
                    }
                    nickname = await In.text(`Type the custom tag that will highlight in the message: `, { default: nickname || '' });
                    console.log(`Type ${chalk.underline.yellow(`\{tag\}`)} to insert the custom tag you made and will be highlighed in the message.`);
                    let message;
                    inputMsg: while (true) {
                         message = await In.text(`Enter message: `, { default: nickname || '' });
                         if (!message?.length) console.log(chalk.red(`Please input a message.`));
                         else break inputMsg;
                    }
                    let parsedMsg = message.replace("{tag}", nickname);
                    console.log(parsedMsg.replace(nickname, chalk.underline(nickname)));
                    let confirm = await In.confirm(`Send this message to '${thread.isGroup ? '[G] ' : ''}${chalk.underline(thread.name || thread.participants[0].name)}? `);
                    if (!confirm) break select;
                    await client.sendMessage(thread.id, parsedMsg, { mentions: [{ id: target.id, offset: parsedMsg.indexOf(nickname), length: nickname.length }] }).catch(console.error);
                    break;

               case 1:
                    let threadList = await client.getThreadList(100).catch(() => console.log(chalk.red("Unable to load threads. Please try again later.")));
                    if (!threadList || threadList.length < 1) return console.log(chalk.yellow("No thread to select."));
                    else {
                         threadList = threadList.filter(t => !t.isArchived && t.canReply);
                         let threadChoice = await In.select("Select thread to send message: ", [
                              { name: chalk.underline.red("Cancel"), value: 0 },
                              ...threadList.map((thread, i) => ({ name: `${thread.isGroup ? '[G] ' : ''}${thread.name || thread.participants[0].name}`, value: i + 1 }))
                         ])
                         if (threadChoice == 0) break select;
                         thread = threadList[threadChoice - 1];
                    }
                    break;

               case 2:
                    if (!thread) {
                         console.log(chalk.red("No thread is selected. Please select a thread first."));
                         break select;
                    }
                    let nicknames = thread.nicknames;
                    thread = await client.getThreadInfo(thread.id);
                    thread.participants = thread.participants.filter(m => m.canMessage);
                    let userChoice = await In.select(`Select a member in ${thread.isGroup ? '[G] ' : ''}${chalk.underline(thread.name || thread.participants[0].name)}: `, [
                         { name: chalk.underline.red("Cancel"), value: 0 },
                         ...thread.participants.map((m, i) => ({ name: m.name, value: i + 1 }))
                    ])
                    if (userChoice === 0) break select;
                    target = thread.participants[userChoice - 1];
                    let nn = nicknames?.find(n => n.participant_id === target.id);
                    nickname = `@${nn?.nickname || target.name} `;
                    break;

               case 3:
                    console.log(chalk.green("Logged out."));
                    process.exit(1);
          }
     }
}

export default main();