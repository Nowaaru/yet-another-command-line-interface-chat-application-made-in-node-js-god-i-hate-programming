import { io } from "socket.io-client";
import * as chanceLib from "chance";
import inquirer, { Answers } from "inquirer";
import enquirer from "enquirer";
import ora, { PromiseOptions } from 'ora';
import chalk from 'chalk';
import ansiEscapes from "ansi-escapes";
import readline from "readline"
import moment from "moment";
import cliCursor from "cli-cursor";
import terminalSize from "term-size";
import Terminal from "terminal-kit";
import nodeCleanup from "node-cleanup";
import chalkPipe from "chalk-pipe";
import stripAnsi from "strip-ansi";
import levenshtein from "js-levenshtein";
import { Logger } from "./logfile.js";
import { convertToUserResolvable, Command, Message, MessageBuffer, User, UserResolvable } from "./definitions.js";
import { Commands } from "./commands.js";

const { prompt: promptEnquirer } = enquirer
const { terminal } = Terminal;
const { clearLine } = readline;
const { cursorTo } = ansiEscapes;
const { prompt } = inquirer;
const Chance = new chanceLib.Chance();
const clientLog = new Logger("client", "./");

const messageBuffer: MessageBuffer = new MessageBuffer(200);
let shouldRefreshEnquirer = true;
let scrollPosition = 0;

prompt([ // if the first question has a port then the second question can be skipped
    {
        type: "input",
        name: "address",
        message: "What is the address of the server?",
        default: "http://localhost",
        initial: "http://localhost"
    },
    {
        type: "numeral", 
        name: "port",
        message: "What is the port of the server?",
        default: "4500",
        initial: "4500",
        skip: (answers: Answers) => answers.address.match(/(\:\d+)$/g)
    }
]).then(async (answers: Answers) => {
    const socket = io(`${answers.address}${answers.port ? `:${answers.port}` : ""}`);
    const connectingOra = ora("Connecting to server...").start();
    socket.on("connect_error", () => {
        console.clear();
        connectingOra.fail(chalk.red("Failed to connect to server."))

        clientLog.error("Could not connect to server.");
        process.exit(1);
    });

    clientLog.info(`Connected to server at ${answers.address}${answers.port ? `:${answers.port}` : ""}`);

    let canTakeMessages: boolean = false;
    let me = socket.id;
    let localUser: UserResolvable;

    const generateMessageFormat = (message: Message, raw?: boolean): string[] => { // raw means that the message is not formatted
        let arrayData = [];
        arrayData.push(`${"█".repeat(4)}|${chalk.hex(message.user.colour).bold(message.user.nickname ?? message.user.name)}|${"█".repeat(4)} # ${moment().calendar(moment(message.timestamp))}`);
        arrayData.push(`${chalk.greenBright(">>")} ${message.text}`);

        if (raw)
            arrayData = arrayData.map(line => stripAnsi(line));

        return arrayData;
    }

    const requestLocalUser = (): Promise<UserResolvable> => {
        return new Promise((resolve, reject) => {
            socket.emit("getUser", (data: {response: {user: UserResolvable}}) => {
                localUser = data.response.user;
                resolve(localUser);
            })
        });
    };

    const calculateWordWrapping = (query: string): number => Math.ceil(  query.length > 1 ? query.length / terminalSize().columns : 1 )


    const checkScroll = () => {
        if (scrollPosition >= messageBuffer.messages.length)
            scrollPosition = messageBuffer.messages.length - 1;

        return scrollPosition;
    }


    const getCommandFromString = (input: string) => {
        const commandName = input.substring(1).split(" ")[0].toLowerCase();
        // use levenshtein distance to determine if the command is valid
        const commandsArray = Commands.map(command => {
            return {
                name: command.name, // could just be compressed to (command.aliases ?? []).map instead of doing [...xz] but honestly i'm too lazy to do that
                potentials: ((x) => {x.push(command.name); return x} )([... (command.aliases ?? [])]).map(x => x.toLowerCase()).sort((a, b) => levenshtein(a, commandName) - levenshtein(b, commandName)) 
            }
        }).sort((a, b) => {
            return levenshtein(a.potentials[0], commandName) - levenshtein(b.potentials[0], commandName);
        });

        // if the command is a 100% match then run the command format
        // otherwise, show the closest match ONLY if the current input is a partial match from the start of the command name
        if (commandName === commandsArray[0].potentials[0]) {
            //find the command
            const command = Commands.find(command => command.name === commandsArray[0].name);
            return {
                command: command,
                match: commandsArray[0].potentials[0]
            };
        } 
    }


    const updateScreen = async () => {
        //Only update from row 1 onwards to make sure the topbar is not overwritten
        terminal.eraseArea(0,0,terminalSize().columns,terminalSize().rows - 2);
        // Print dashes right below the bottom bar
        terminal.moveTo(0, terminalSize().rows - 2);
        terminal.eraseLine();
        terminal( ("█▓").repeat(terminalSize().columns / 2).substring(0, terminalSize().columns - 1) );
        // Set cursor to the top of the screen to start drawing messages
        terminal.moveTo(0, 0);
        // Draw messages
        let totalOccupiedLines = 0;
        for (const message of [...messageBuffer.messages].reverse()) {
            const generatedMessageFormat = generateMessageFormat(message);
            const messageLines = generateMessageFormat(message, true).map((line: string) => {
                // clientLog.log(`Word wrap length for "${line}:" ${calculateWordWrapping(line)} `)
                return calculateWordWrapping(line);
            }).reverse(); // Reverse to draw from bottom to top
            const linesThatWouldBeOccupied = messageLines.reduce((a, b) => a + b, 0);

            if ( (terminalSize().rows - 2) - (totalOccupiedLines + linesThatWouldBeOccupied) < 1) {
                clientLog.info("Cache filled, popping...");
                break;
            } else {
                terminal.moveTo(0, (terminalSize().rows - 2) - totalOccupiedLines);

                let traversedLines = 0;
                generatedMessageFormat.reverse().forEach((line: string, lineIndex: number) => {
                    clientLog.log(`Drawing line ${line}`);
                    // terminal.moveTo(0, totalOccupiedLines - lineIndex - 1);
                    terminal.move(0, -(messageLines[lineIndex] + traversedLines) ); 
                    process.stdout.write(`${line}\n`);
                    traversedLines += messageLines[lineIndex];
                });
            }

            totalOccupiedLines += linesThatWouldBeOccupied;
        }    
        

        //add a horizontal line at 0,0 all the way to the end of the screen
        terminal.moveTo(0, 0);
        terminal(("-").repeat(terminalSize().columns));

        // Reset terminal cursor
        terminal.moveTo(0, terminalSize().rows - 1);

        // move to the bottom of the screen to have a space for the input
        cursorTo(0, process.stdout.rows + 1);
        cliCursor.show();

        if (!shouldRefreshEnquirer)
            return;

        shouldRefreshEnquirer = false;

        // const data: { message: string } = await prompt({
        //     type: "input",
        //     name: "message",
        //     message: "",
        // });
        
        const Prompt = await prompt([
            {
                type: "input",
                name: "message",
                message: "",
                validate: (input: string) => {
                    if (input.length > 0)
                        return true;
            
                    return false;
                },
                transformer: (input: string, lastAnswers: Answers, flags) => {
                    // this function formats the input if the command is valid so it looks prettier in the terminal
                    // determine if the input is a command
                    if (flags.isFinal)
                        return input;

                    input = stripAnsi(input);
                    if (input.startsWith("/")) {
                        const modifiedMessage = input.substring(1);
                        const splitMessage = modifiedMessage.split(" ");
                        const commandName = splitMessage[0];
                        const args = splitMessage.slice(1);
                    
                        // use levenshtein distance to determine if the command is valid
                        const commandsArray = Commands.map(command => {
                            return {
                                name: command.name, // could just be compressed to (command.aliases ?? []).map instead of doing [...xz] but honestly i'm too lazy to do that
                                potentials: ((x) => {x.push(command.name); return x} )([... (command.aliases ?? [])]).map(x => x.toLowerCase()).sort((a, b) => levenshtein(a, commandName) - levenshtein(b, commandName)) 
                            }
                        }).sort((a, b) => {
                            return levenshtein(a.potentials[0], commandName) - levenshtein(b.potentials[0], commandName);
                        });

                        // if the command is a 100% match then run the command format
                        // otherwise, show the closest match ONLY if the current input is a partial match from the start of the command name
                        if (commandName === commandsArray[0].potentials[0]) {
                            //find the command
                            const command = Commands.find(command => command.name === commandsArray[0].name);
                            if (!command || !command.format)
                                return input;
                            
                            return command.format(input, args);
                        } else if (commandsArray[0].potentials[0].startsWith(commandName) && args.length === 0) {
                            return `/${commandName}${chalk.dim(commandsArray[0].potentials[0].substring(commandName.length))}`;
                        };
                    }
                    
                    return input;
                },

            }
        ]);
        shouldRefreshEnquirer = true;

        // Send data to server to be broadcasted to other users
        // When a message is sent, also add it to the message buffer

        const userToUse = localUser ?? await requestLocalUser();
        const send = (textToSend = Prompt.message) => {
            socket.emit("message", {
                text: textToSend
            });

            messageBuffer.add({
                text: textToSend,
                user: localUser,
                timestamp: (new Date()).getTime()
            })

            return true;
        };

        // If the message is a command, run it. Do not call send() because the executeClient() function will call send()
        if (Prompt.message.startsWith("/")) {
            const foundCommand = getCommandFromString(Prompt.message);
            if (foundCommand) {
                if (foundCommand.command?.executeClient) {
                    foundCommand.command.executeClient(socket as any, Prompt.message, Prompt.message.split(" ").splice(1), send);
                }
                // if executeServer is present, then that means that we should emit the "command" event to the server
                if (foundCommand.command?.executeServer) {
                    socket.emit("command", {
                        command: foundCommand.command.name,
                        args: Prompt.message.split(" ").splice(1)
                    });
                }
            } else send();
        } else
            send(Prompt.message);

        // remove the last line from the screen so the enquirer can be drawn on top of it
        terminal.moveTo(0, terminalSize().rows - 1);
        terminal.eraseLine();

        updateScreen();
        clientLog.info("Length:" + messageBuffer.size);
    }
    socket.on("connect", async () => {
        connectingOra.succeed("Successfully connected to the server!").stop();
        //wait 1 second to allow the server to send the user the initial messages
        await new Promise(resolve => setTimeout(resolve, 1000));

        // registration of the user 
        me = socket.id;
        console.clear();
        clientLog.info("Connected to server");

        //TODO: username prompt
        const data: {username: string} = await promptEnquirer({
            type: "input",
            name: "username",
            message: "Enter your username:",
            initial: "Anonymous"
        });

        const login = ora(`Logging in as ${chalk.redBright.bold(data.username)}...`).start();
        // begin taking messages from the server a bit later

        try {
            setTimeout(() => {
                login.succeed("Logged in successfully").stop();
                setTimeout(() => {
                    canTakeMessages = true;
                    updateScreen();
                    socket.emit("joined");
                }, 1000);
            }, 1000);

            socket.on("message", (data) => {
                messageBuffer.add(data);
                if (canTakeMessages) {
                    updateScreen();
                }
            });
            
            socket.emit("joining", {username: data.username})//{username: data.username});
        }
        catch (e) {
            // login.fail("Failed to log in...");
            console.log(e);
        }
    })

    process.stdout.on("resize", () => {
        updateScreen();
    })

    nodeCleanup(() => {
        if (socket.connected) {
            socket.disconnect();
        }
    });
});