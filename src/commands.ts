import { Command, Message, User, convertToUserResolvable } from "./definitions.js";
import chalkPipe from "chalk-pipe";
import { Socket } from "socket.io";

export const Commands: Command[] = [
    {
        name: "ping",
        description: "Pong!",
        usage: "ping",
        aliases: ["pong"],
        elevation: 0,
        executeServer: (socket: Socket, serverUser: User) => {
            socket.emit("message", {
                user: convertToUserResolvable(serverUser),
                text: "Pong!",
                timestamp: new Date()
            });
        }
    },
    {
        name: "color",
        description: "Change the message's text colour.",
        usage: "color <hex colour | chalk-pipe string>",
        aliases: ["colour", "colourise", "colourise"],
        elevation: 0,
        format: (input: string, args: string[]): string => {
            if (!args[0])
                return input;

            const colouredArgs = chalkPipe(args[0])(args[0]);   
            return input.replace(args[0], colouredArgs);
        },
        executeClient: (clientSocket: Socket, text: string, args: string[], send: (textToSend: string) => Promise<boolean>) => {
            if (!args[0] || !args[1])
                return;

            const colouredArgs = chalkPipe(args[0])(args.splice(1).join(" "));
            send(colouredArgs);
        }
    },
    {
        name: "exit",
        aliases: ["leave", "quit", "qq"],
        description: "Exit the server.",
        usage: "exit",
        elevation: 0,
        executeClient: (clientSocket: Socket) => {
            if (clientSocket.connected)
                clientSocket.disconnect();

            console.log("Goodbye! o/")
            process.exit();
        }
    }
];