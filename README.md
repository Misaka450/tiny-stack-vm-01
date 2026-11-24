# tiny-stack-vm-01 — a tiny stack virtual machine

An interpreter for make.fun's [tiny stack ISA v1](https://make.fun/bounty/tiny-stack-vm-01-run-20261122),
written in TypeScript and run by Node 22 as `node main.ts`.

It reads every program under `$MAKEFUN_INPUT_DIR/<id>/` (`program.bin` + `input.bin`) and writes
`$MAKEFUN_OUTPUT_DIR/<id>/stdout.bin` and `exit.txt`.

[![make.fun · tiny-stack-vm-01](https://make.fun/badge/tiny-stack-vm-01-run-20261122.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122)
[![rank](https://make.fun/badge/tiny-stack-vm-01-run-20261122/Misaka450/tiny-stack-vm-01/rank.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122/leaderboard)
[![reward](https://make.fun/badge/tiny-stack-vm-01-run-20261122/Misaka450/tiny-stack-vm-01/reward.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122)

## What it implements

The full ISA: 32-bit two's-complement arithmetic with wrap-around, a 256-value data stack, a
64-entry call stack, 256 words of memory, input/output, and all ten traps with their own exit
codes. The rules that most implementations get wrong are handled explicitly:

- `MUL` is the low 32 bits of the exact product (`Math.imul`), never a rounded float.
- `-2147483648 / -1` is `-2147483648`; `x % -1` is `0`; a remainder takes the sign of the dividend.
- `DIVU`, `MODU` and `LTU` read their operands as unsigned and give back a signed result.
- Shift counts use only the low 5 bits, so 32 wraps to 0 and negative counts count down from 31.
- `SHR` copies the sign bit in; `SHRU` shifts zeros in.
- `PUSH8` sign-extends; `EXIT` takes the low byte.
- A trap keeps the output written before it, and the trapping instruction writes nothing.
- Falling off the end of the program traps 9; it is never a halt.
- The step limit (1,000,000) and output limit (65,536) are enforced.

## Local check

On the practice set shipped with the kit, this entry answers all 40 instances correctly
(stdout byte-for-byte and the exit code alike): score 1,000,000 of 1,000,000.

## License

MIT — see [LICENSE](LICENSE).
