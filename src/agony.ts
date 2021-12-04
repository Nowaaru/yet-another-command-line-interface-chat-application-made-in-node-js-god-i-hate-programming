import enquirer from "enquirer";
import cliCursor from "cli-cursor";
const { prompt } = enquirer;

prompt({
    type: "input",
    name: "name",
    message: "What is your name?"
}).then((data: any) => {
    console.log(`Hello ${data . name}!`);
}).then(() => {
    cliCursor.show();
    setInterval(() => {
    prompt({
        type: "input",
        name: "name",
        message: "What is your name?"
    }).then((data: any) => {
        console.log(`Hello ${data . name}!`);
    }).then(() => {
        console.log("Goodbye!");
    });
}, 5000);
});
