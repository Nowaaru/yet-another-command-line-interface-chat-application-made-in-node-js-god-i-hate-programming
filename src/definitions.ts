import { Socket, RemoteSocket } from "socket.io";
import { Chance } from "chance";

export class User {
    constructor(name: string, tag: string, socket?: Socket) {
        this.#_name = name;
        this.#_socket = socket;
        this.#_tag = tag;
        this.#_colour = (new Chance()).color({ format: 'hex', casing: 'upper' });
    }

    public setElevation() {
        this.#_elevation = this.#_elevation;
    }

    public setName() {
        this.#_name = this.#_name;
    }

    public setTag() {
        this.#_tag = this.#_tag;
    }

    public setNickname() {
        this.#_nickname = this.#_nickname;
    }

    public setColour(color: string) {
        this.#_colour = color;
    }

    public setColor = (color: string) => {
        return this.setColour(color);
    }

    public get colour() {
        return this.#_colour;
    }

    public get name() {
        return this.#_name;
    }

    public get tag() {
        return this.#_tag;
    }

    public get nickname() {
        return this.#_nickname;
    }

    public get socket() {
        return this.#_socket;
    }

    public get elevation() {
        return this.#_elevation;
    }

    #_colour: string;
    #_elevation: number = 0;
    #_tag: string;
    #_name: string;
    #_nickname: string | null = null;
    #_socket?: Socket;
}

export interface UserResolvable {
    name: string;
    tag: string;
    nickname: string | null;
    elevation: number;
    colour: string;
}

export function convertToUserResolvable(user: User): UserResolvable {
    return {
        name: user.name,
        tag: user.tag,
        nickname: user.nickname,
        elevation: user.elevation,
        colour: user.colour
    };
}

export interface Command {  
    name: string;
    description: string;
    usage: string;
    aliases: string[];
    elevation: number;
    format?: (<T>() => T) | ((input: string, args: string[]) => any);
    executeClient?(clientSocket: Socket, text: string, args: string[], send: () => boolean | Promise<boolean>): void;
    executeServer?(socket: Socket, serverUser: User): void;
}

export interface Message {
    user: User | UserResolvable;
    text: string;
    timestamp: Date | number;
}

export class MessageBuffer {
    constructor(cacheSize: number = 5) {
        this.#_cacheSize = cacheSize;
    }

    public get latestmessage() {
        return this.#_messageCache[this.#_messageCache.length - 1];
    }

    public get messages() {
        return [...this.#_messageCache]; // return a copy of the array
    }

    public get size() {
        return this.#_messageCache.length;
    }

    public add(message: Message) {
        this.#_messageCache.push(message);
        if (this.#_messageCache.length > this.#_cacheSize) {
            this.#_messageCache.shift();
        }
    }

    #_cacheSize;
    #_messageCache: Message[] = []
}