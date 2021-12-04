import fs from "fs";
import nodeCleanup from "node-cleanup"

const generateNameKey = (name: string, path: string, number: number) => `${(path.endsWith("/") || path.endsWith("\\")) ? path : path + "/"}${name}${number ? `-${number}` : ""}`;
export class Logger {
    constructor(name: any, path: any) {
        let classificationName = 0;
        while (fs.existsSync(generateNameKey(name, path, classificationName) + ".log")) {
            classificationName++;
        }

        let fileKey = generateNameKey(name, path, classificationName) + ".log";
        if (fs.existsSync(fileKey))
            fs.unlinkSync(fileKey);
        
        this.#file = fs.createWriteStream(`${(path.endsWith("/") || path.endsWith("\\")) ? path : path + "/"}${name}.log`, { flags: 'a' });
        this.#name = name;

        this.info(`Logger started.`);
        nodeCleanup(() => {
            this.info("Closing logger...");
            this.close();
        });
    }

    public log(message: any) {
        this.#file.write(`[LOG] ${message}\n`);
    }

    public error(message: any) {
        this.#file.write(`[ERROR] ${message}\n`);
    }

    public warn(message: any) {
        this.#file.write(`[WARN] ${message}\n`);
    }

    public info(message: any) {
        this.#file.write(`[INFO] ${message}\n`);
    }

    public debug(message: any) {
        this.#file.write(`[DEBUG] ${message}\n`);
    }

    public close() {
        this.#file.close();
    }

    #file: fs.WriteStream;
    #name: any;
}