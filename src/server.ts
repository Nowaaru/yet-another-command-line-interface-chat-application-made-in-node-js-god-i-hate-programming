import Enquirer from "enquirer";
import terminalSize from "term-size";
import terminalKit from "terminal-kit";
import chalk from "chalk";
import moment from "moment";
import os from "os";

// @ts-ignore
import { usagePercent } from "cpu-stat"; // I had to ignore this since I absolutely refuse to type this library
import { Server, Socket } from "socket.io";
import { Logger as logfile } from "./logfile.js"
import { User, convertToUserResolvable, Message } from "./definitions.js";

import * as commands from "./commands.js";
import * as chanceLib from "chance";

const { Commands } = commands
const { terminal } = terminalKit;

const Chance = new chanceLib.Chance();
const Logger = new logfile("server", "./");
const Users: {[socketId: string]: User} = {};

const clamp = (num: number, min: number, max: number) => Math.max(Math.min(num, max), min);

/**
 * Converts a long string of bytes into a readable format e.g KB, MB, GB, TB, YB
 * 
 * @param {Int} num The number of bytes.
**/
export function readableBytes(bytes: number, showUnits: boolean = true): string {
    let i = Math.floor(Math.log(bytes) / Math.log(1024)),
    sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    return `${(bytes / Math.pow(1024, i)).toFixed(2)}${showUnits ? ` ${sizes[i]}` : ""}`; 
}

// cpu clock for interface

{
    setInterval(() => {
        usagePercent({sampleMs: 1000},(didErr: Error, percent: number | undefined, duration: number) => {
            if (didErr)
                throw didErr;
            
            process.env.cpu_usage = String(percent);
        })
    }, 1100);
}

Enquirer.prompt({
    type: "numeral",
    name: "port",
    message: "What port would you like to use?",
}).then(async (portData: any) => {
    const io = new Server(portData.port, {});
    const serverStartTime = moment();

    let cpuUsage = 0;
    let totalSentMessages = 0;
    // measure cpu usage via loop
    

    //graphical user interface
    const generateServerUI = () => {
        //Usage Thresholds (in bytes)
        const memoryUsageThreshold = 3e9;
        const upperColourBound = 165;

        const currentMemoryUsedPercentage = memoryUsageThreshold / os.totalmem();
        const inversePercentage = upperColourBound - upperColourBound * (clamp(process.memoryUsage().rss / memoryUsageThreshold, 0, 1));

        terminal.clear().moveTo(0, 0)("█".repeat(terminal.width)).moveTo(0, terminal.height - 1)("█".repeat(terminal.width))
            .moveTo((terminal.width - 1) / 2 - Math.ceil("Server".length / 2), 0)(chalk.bold("Server"))
            .moveTo(4, 4)(`${chalk.red("-")} Connected Users: ${chalk.greenBright(Object.keys(Users).length)}`)
            .moveTo(4, 5)(`${chalk.red("-")} Total Messages Sent: ${chalk.greenBright(totalSentMessages)}`)
            .moveTo(4, 6)(`${chalk.red("-")} Server Uptime: ${chalk.greenBright(moment().diff(serverStartTime, "seconds"))} seconds`)
            .moveTo(0, terminalSize().rows - 2)(`Server is running on port ${chalk.greenBright(portData.port)}`)

            .moveTo(4, 8)(`${chalk.red("-")} Memory Usage: ${chalk.rgb(upperColourBound, inversePercentage, inversePercentage).bold((process.memoryUsage().rss / os.totalmem() * 100).toFixed(3))}% (${readableBytes(process.memoryUsage().rss)} of ${readableBytes(os.totalmem())})`)
            .moveTo(4, 9)(`${chalk.red("-")} CPU Usage: ${Math.round(Number(process.env.cpu_usage))}%`)
    }    

    process.on('SIGWINCH', function() {});
    process.stdout.on("resize", generateServerUI);
    setInterval(generateServerUI, 1000);

    // helper to create new User object from socket
    Users["SERVER"] = new User("Server", "0000");

    io.on("connection", (socket: Socket) => {
        console.log("Client connected:", socket.id);

        socket.on("disconnect", () => {
            console.log("Client disconnected:", socket.id);
            if (!Users[socket.id]) return;

            let User = Users[socket.id];
            socket.broadcast.emit("message", {
                text: `${User.name} has left the server. o/`,
                user: convertToUserResolvable(Users["SERVER"])
            });  

            delete Users[socket.id];
        });

        socket.on("joining", (data: any) => {
            const user = new User(data.username, String(Chance.integer({ min: 1, max: 9999 })).padStart(4, "0"), socket);
            Users[socket.id] = user;

            socket.on("joined", () => {
                console.log('joined');
                socket.emit("message", { // broadcast to all sockets except the one that just joined
                    text: `Welcome, ${user.name}!`,
                    user: convertToUserResolvable(Users["SERVER"])
                });
                
                socket.broadcast.emit("message", {
                    text: `${user.name} has joined the chat!`,
                    user: convertToUserResolvable(Users["SERVER"])
                });  
                
                socket.on("message", (data: Message) => {
                    totalSentMessages++;
                    socket.broadcast.emit("message", {
                        text: data.text,
                        user: convertToUserResolvable(user),
                        timestamp: (new Date()).getTime()
                    });
                })
            });

            // utility listener so clients can request their user
            socket.on("getUser", (callback) => {
                callback({
                    code: 200,
                    response:  {
                        user: convertToUserResolvable(user)
                    }
                });
            });

            // command handling
            socket.on("command", (requestData: {command: string, args: string[]}) => {            
                // users
                const matchingCommand = Commands.find(command => command.name.toLowerCase() === requestData.command.toLowerCase());
                if (matchingCommand) {
                    if (user.elevation >= matchingCommand.elevation) {
                        if (matchingCommand.executeServer)
                            matchingCommand.executeServer(socket, Users["SERVER"]);
                    }

                }
            });     
        });
    })
});
