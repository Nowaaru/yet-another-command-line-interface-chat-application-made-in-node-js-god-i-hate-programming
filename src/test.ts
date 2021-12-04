import terminalSize from "term-size";
import Terminal from "terminal-kit";

const { terminal } = Terminal;
const calculateWordWrapping = (line: string): number => {
   // does not split by word, but by character
   let chars = 0; 
   let lines = 1;
   [...line].forEach(char => {
        chars += 1;
        if (chars > terminalSize().columns) {
            chars = 0;
            lines += 1;
        }
    });

    return lines;
}

const query = "a".repeat(terminalSize().columns * 1);
console.log(  )

// console.log(calculateWordWrapping(query));
console.log(query);

