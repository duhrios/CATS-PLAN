import { randomBytes, scryptSync } from "node:crypto";

if (!process.stdin.isTTY || !process.stdin.setRawMode) {
  throw new Error("Execute este comando em um terminal interativo para digitar a senha com segurança.");
}

const chunks = [];
process.stdout.write("Senha: ");
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdin.on("data", (key) => {
  if (key === "\u0003") {
    process.stdout.write("\n");
    process.exit(1);
  }
  if (key === "\r" || key === "\n") {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    const password = chunks.join("");
    if (!password) throw new Error("A senha não pode ficar vazia.");
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    process.stdout.write(`\nscrypt$${salt.toString("hex")}$${hash.toString("hex")}\n`);
    process.exit(0);
  }
  if (key === "\u007f" || key === "\b") {
    chunks.pop();
    return;
  }
  chunks.push(key);
});
