import * as fs from "node:fs";
import { join } from "node:path";

function runVm(p: Uint8Array, inp: Uint8Array): { code: number; stdout: Uint8Array } {
  const pl = p.length, il = inp.length;
  const st = new Int32Array(256), cs = new Int32Array(64), mem = new Int32Array(256);
  const out = new Uint8Array(65536);
  let pc = 0, sp = 0, csp = 0, ip = 0, ol = 0, steps = 0;

  const end = (code: number) => ({ code, stdout: out.subarray(0, ol) });
  const i16 = (i: number) => ((p[i] | (p[i + 1] << 8)) << 16) >> 16;

  while (true) {
    if (steps >= 1e6) return end(10);
    if (pc < 0 || pc >= pl) return end(9);

    const op = p[pc];
    steps++;

    switch (op) {
      case 0x00: return end(0);
      case 0x01:
        if (pc + 2 > pl) return end(9);
        if (sp >= 256) return end(3);
        st[sp++] = (p[pc + 1] << 24) >> 24; pc += 2; continue;
      case 0x02:
        if (pc + 5 > pl) return end(9);
        if (sp >= 256) return end(3);
        st[sp++] = p[pc + 1] | (p[pc + 2] << 8) | (p[pc + 3] << 16) | (p[pc + 4] << 24);
        pc += 5; continue;
      case 0x03: if (sp < 1) return end(2); sp--; break;
      case 0x04: if (sp < 1) return end(2); if (sp >= 256) return end(3); st[sp] = st[sp - 1]; sp++; break;
      case 0x05: { if (sp < 2) return end(2); const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t; break; }
      case 0x06: if (sp < 2) return end(2); if (sp >= 256) return end(3); st[sp] = st[sp - 2]; sp++; break;
      case 0x07: {
        if (sp < 3) return end(2);
        const a = st[sp - 3]; st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a; break;
      }
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        if (sp < 2) return end(2);
        const b = st[--sp], a = st[sp - 1];
        if (op >= 0x13 && op <= 0x16 && b === 0) return end(4);
        st[sp - 1] =
          op === 0x10 ? (a + b) | 0 :
          op === 0x11 ? (a - b) | 0 :
          op === 0x12 ? Math.imul(a, b) :
          op === 0x13 ? Math.trunc(a / b) | 0 :
          op === 0x14 ? (a % b) | 0 :
          op === 0x15 ? Math.trunc((a >>> 0) / (b >>> 0)) | 0 :
          op === 0x16 ? ((a >>> 0) % (b >>> 0)) | 0 :
          op === 0x18 ? a & b :
          op === 0x19 ? a | b :
          op === 0x1a ? a ^ b :
          op === 0x1c ? a << (b & 31) :
          op === 0x1d ? a >> (b & 31) :
          op === 0x1e ? (a >>> (b & 31)) | 0 :
          op === 0x20 ? +(a === b) :
          op === 0x21 ? +(a < b) :
          +((a >>> 0) < (b >>> 0));
        break;
      }
      case 0x17: if (sp < 1) return end(2); st[sp - 1] = -st[sp - 1] | 0; break;
      case 0x1b: if (sp < 1) return end(2); st[sp - 1] = ~st[sp - 1]; break;
      case 0x30: if (pc + 3 > pl) return end(9); pc += 3 + i16(pc + 1); continue;
      case 0x31: if (pc + 3 > pl) return end(9); if (sp < 1) return end(2); pc += 3 + (st[--sp] === 0 ? i16(pc + 1) : 0); continue;
      case 0x32: if (pc + 3 > pl) return end(9); if (sp < 1) return end(2); pc += 3 + (st[--sp] !== 0 ? i16(pc + 1) : 0); continue;
      case 0x33:
        if (pc + 3 > pl) return end(9);
        if (csp >= 64) return end(7);
        cs[csp++] = pc + 3; pc = p[pc + 1] | (p[pc + 2] << 8); continue;
      case 0x34: if (csp === 0) return end(8); pc = cs[--csp]; continue;
      case 0x40: {
        if (sp < 1) return end(2);
        const a = st[sp - 1]; if (a < 0 || a >= 256) return end(6);
        st[sp - 1] = mem[a]; break;
      }
      case 0x41: {
        if (sp < 2) return end(2);
        const a = st[sp - 1]; if (a < 0 || a >= 256) return end(6);
        mem[a] = st[sp - 2]; sp -= 2; break;
      }
      case 0x50: {
        if (sp < 1) return end(2);
        const s = String(st[--sp]);
        if (ol + s.length > 65536) return end(11);
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 0x51: if (sp < 1) return end(2); if (ol + 1 > 65536) return end(11); out[ol++] = st[--sp] & 255; break;
      case 0x52: if (sp >= 256) return end(3); st[sp++] = ip < il ? inp[ip++] : -1; break;
      case 0x53: if (sp < 1) return end(2); return end(st[--sp] & 255);
      default: return end(5);
    }
    pc++;
  }
}

const inDir = process.env.MAKEFUN_INPUT_DIR || "/input";
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
fs.mkdirSync(outDir, { recursive: true });

for (const id of fs.readdirSync(inDir).sort()) {
  const d = join(inDir, id);
  if (!fs.statSync(d).isDirectory()) continue;
  const o = join(outDir, id);
  const ip = join(d, "input.bin");
  const { code, stdout } = runVm(
    fs.readFileSync(join(d, "program.bin")),
    fs.existsSync(ip) ? fs.readFileSync(ip) : new Uint8Array(0),
  );
  fs.mkdirSync(o, { recursive: true });
  fs.writeFileSync(join(o, "stdout.bin"), stdout);
  fs.writeFileSync(join(o, "exit.txt"), `${code}\n`);
}
