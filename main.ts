import * as fs from "node:fs";
import * as path from "node:path";

interface RunResult {
  code: number;
  stdout: Uint8Array;
}

const MAX_STEPS = 1_000_000;
const MAX_STACK = 256;
const MAX_CALL = 64;
const MAX_MEM = 256;
const MAX_OUT = 65_536;

function runVm(prog: Uint8Array, input: Uint8Array): RunResult {
  const progLen = prog.length;
  const inLen = input.length;
  const stack = new Int32Array(MAX_STACK);
  const callStack = new Int32Array(MAX_CALL);
  const mem = new Int32Array(MAX_MEM);
  const out = new Uint8Array(MAX_OUT);

  let pc = 0;
  let sp = 0;
  let csp = 0;
  let inPos = 0;
  let outLen = 0;
  let steps = 0;

  const done = (code: number): RunResult => ({
    code,
    stdout: out.subarray(0, outLen),
  });

  while (true) {
    if (steps >= MAX_STEPS) return done(10);
    if (pc < 0 || pc >= progLen) return done(9);

    const op = prog[pc];

    switch (op) {
      case 0x00: { // HALT
        steps++;
        return done(0);
      }

      case 0x01: { // PUSH8
        if (pc + 2 > progLen) return done(9);
        steps++;
        if (sp >= MAX_STACK) return done(3);
        stack[sp++] = (prog[pc + 1] << 24) >> 24;
        pc += 2;
        break;
      }

      case 0x02: { // PUSH32
        if (pc + 5 > progLen) return done(9);
        steps++;
        if (sp >= MAX_STACK) return done(3);
        stack[sp++] =
          prog[pc + 1] |
          (prog[pc + 2] << 8) |
          (prog[pc + 3] << 16) |
          (prog[pc + 4] << 24);
        pc += 5;
        break;
      }

      case 0x03: { // POP
        steps++;
        if (sp < 1) return done(2);
        sp--;
        pc++;
        break;
      }

      case 0x04: { // DUP
        steps++;
        if (sp < 1) return done(2);
        if (sp >= MAX_STACK) return done(3);
        stack[sp] = stack[sp - 1];
        sp++;
        pc++;
        break;
      }

      case 0x05: { // SWAP
        steps++;
        if (sp < 2) return done(2);
        const top = stack[sp - 1];
        stack[sp - 1] = stack[sp - 2];
        stack[sp - 2] = top;
        pc++;
        break;
      }

      case 0x06: { // OVER
        steps++;
        if (sp < 2) return done(2);
        if (sp >= MAX_STACK) return done(3);
        stack[sp] = stack[sp - 2];
        sp++;
        pc++;
        break;
      }

      case 0x07: { // ROT: ( a b c -- b c a )
        steps++;
        if (sp < 3) return done(2);
        const a = stack[sp - 3];
        stack[sp - 3] = stack[sp - 2];
        stack[sp - 2] = stack[sp - 1];
        stack[sp - 1] = a;
        pc++;
        break;
      }

      case 0x10: { // ADD
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = (stack[sp - 2] + stack[sp - 1]) | 0;
        sp--;
        pc++;
        break;
      }

      case 0x11: { // SUB
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = (stack[sp - 2] - stack[sp - 1]) | 0;
        sp--;
        pc++;
        break;
      }

      case 0x12: { // MUL
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = Math.imul(stack[sp - 2], stack[sp - 1]);
        sp--;
        pc++;
        break;
      }

      case 0x13: { // DIV
        steps++;
        if (sp < 2) return done(2);
        const b = stack[sp - 1];
        if (b === 0) return done(4);
        stack[sp - 2] = Math.trunc(stack[sp - 2] / b) | 0;
        sp--;
        pc++;
        break;
      }

      case 0x14: { // MOD
        steps++;
        if (sp < 2) return done(2);
        const b = stack[sp - 1];
        if (b === 0) return done(4);
        stack[sp - 2] = (stack[sp - 2] % b) | 0;
        sp--;
        pc++;
        break;
      }

      case 0x15: { // DIVU
        steps++;
        if (sp < 2) return done(2);
        const b = stack[sp - 1] >>> 0;
        if (b === 0) return done(4);
        stack[sp - 2] = Math.trunc((stack[sp - 2] >>> 0) / b) | 0;
        sp--;
        pc++;
        break;
      }

      case 0x16: { // MODU
        steps++;
        if (sp < 2) return done(2);
        const b = stack[sp - 1] >>> 0;
        if (b === 0) return done(4);
        stack[sp - 2] = ((stack[sp - 2] >>> 0) % b) | 0;
        sp--;
        pc++;
        break;
      }

      case 0x17: { // NEG
        steps++;
        if (sp < 1) return done(2);
        stack[sp - 1] = -stack[sp - 1] | 0;
        pc++;
        break;
      }

      case 0x18: { // AND
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = stack[sp - 2] & stack[sp - 1];
        sp--;
        pc++;
        break;
      }

      case 0x19: { // OR
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = stack[sp - 2] | stack[sp - 1];
        sp--;
        pc++;
        break;
      }

      case 0x1a: { // XOR
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = stack[sp - 2] ^ stack[sp - 1];
        sp--;
        pc++;
        break;
      }

      case 0x1b: { // NOT
        steps++;
        if (sp < 1) return done(2);
        stack[sp - 1] = ~stack[sp - 1];
        pc++;
        break;
      }

      case 0x1c: { // SHL
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = stack[sp - 2] << (stack[sp - 1] & 31);
        sp--;
        pc++;
        break;
      }

      case 0x1d: { // SHR
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = stack[sp - 2] >> (stack[sp - 1] & 31);
        sp--;
        pc++;
        break;
      }

      case 0x1e: { // SHRU
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = (stack[sp - 2] >>> (stack[sp - 1] & 31)) | 0;
        sp--;
        pc++;
        break;
      }

      case 0x20: { // EQ
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = stack[sp - 2] === stack[sp - 1] ? 1 : 0;
        sp--;
        pc++;
        break;
      }

      case 0x21: { // LT
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = stack[sp - 2] < stack[sp - 1] ? 1 : 0;
        sp--;
        pc++;
        break;
      }

      case 0x22: { // LTU
        steps++;
        if (sp < 2) return done(2);
        stack[sp - 2] = (stack[sp - 2] >>> 0) < (stack[sp - 1] >>> 0) ? 1 : 0;
        sp--;
        pc++;
        break;
      }

      case 0x30: { // JMP
        if (pc + 3 > progLen) return done(9);
        steps++;
        const off = ((prog[pc + 1] | (prog[pc + 2] << 8)) << 16) >> 16;
        pc = pc + 3 + off;
        break;
      }

      case 0x31: { // JZ
        if (pc + 3 > progLen) return done(9);
        steps++;
        if (sp < 1) return done(2);
        const v = stack[--sp];
        const off = ((prog[pc + 1] | (prog[pc + 2] << 8)) << 16) >> 16;
        pc = v === 0 ? pc + 3 + off : pc + 3;
        break;
      }

      case 0x32: { // JNZ
        if (pc + 3 > progLen) return done(9);
        steps++;
        if (sp < 1) return done(2);
        const v = stack[--sp];
        const off = ((prog[pc + 1] | (prog[pc + 2] << 8)) << 16) >> 16;
        pc = v !== 0 ? pc + 3 + off : pc + 3;
        break;
      }

      case 0x33: { // CALL
        if (pc + 3 > progLen) return done(9);
        steps++;
        if (csp >= MAX_CALL) return done(7);
        const target = prog[pc + 1] | (prog[pc + 2] << 8);
        callStack[csp++] = pc + 3;
        pc = target;
        break;
      }

      case 0x34: { // RET
        steps++;
        if (csp === 0) return done(8);
        pc = callStack[--csp];
        break;
      }

      case 0x40: { // LOAD
        steps++;
        if (sp < 1) return done(2);
        const addr = stack[sp - 1];
        if (addr < 0 || addr >= MAX_MEM) return done(6);
        stack[sp - 1] = mem[addr];
        pc++;
        break;
      }

      case 0x41: { // STORE: ( v addr -- )
        steps++;
        if (sp < 2) return done(2);
        const addr = stack[sp - 1];
        const v = stack[sp - 2];
        if (addr < 0 || addr >= MAX_MEM) return done(6);
        mem[addr] = v;
        sp -= 2;
        pc++;
        break;
      }

      case 0x50: { // PRINT
        steps++;
        if (sp < 1) return done(2);
        const s = String(stack[--sp]);
        if (outLen + s.length > MAX_OUT) return done(11);
        for (let i = 0; i < s.length; i++) {
          out[outLen++] = s.charCodeAt(i);
        }
        pc++;
        break;
      }

      case 0x51: { // PUTC
        steps++;
        if (sp < 1) return done(2);
        const v = stack[--sp];
        if (outLen + 1 > MAX_OUT) return done(11);
        out[outLen++] = v & 255;
        pc++;
        break;
      }

      case 0x52: { // IN
        steps++;
        if (sp >= MAX_STACK) return done(3);
        stack[sp++] = inPos < inLen ? input[inPos++] : -1;
        pc++;
        break;
      }

      case 0x53: { // EXIT
        steps++;
        if (sp < 1) return done(2);
        return done(stack[--sp] & 255);
      }

      default:
        return done(5);
    }
  }
}

function main(): void {
  const inputDir = process.env.MAKEFUN_INPUT_DIR || "/input";
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

  fs.mkdirSync(outputDir, { recursive: true });

  const ids = fs
    .readdirSync(inputDir)
    .filter((name) => fs.statSync(path.join(inputDir, name)).isDirectory())
    .sort();

  for (const id of ids) {
    const inSub = path.join(inputDir, id);
    const outSub = path.join(outputDir, id);
    const prog = fs.readFileSync(path.join(inSub, "program.bin"));
    const inPath = path.join(inSub, "input.bin");
    const input = fs.existsSync(inPath)
      ? fs.readFileSync(inPath)
      : new Uint8Array(0);

    const { code, stdout } = runVm(prog, input);

    fs.mkdirSync(outSub, { recursive: true });
    fs.writeFileSync(path.join(outSub, "stdout.bin"), stdout);
    fs.writeFileSync(path.join(outSub, "exit.txt"), `${code}\n`);
  }
}

main();
