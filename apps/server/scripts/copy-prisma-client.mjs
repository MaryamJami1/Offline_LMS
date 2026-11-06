// The Prisma client is generated as JavaScript into src/generated, which tsc
// does not copy, so the build puts it beside the compiled code that imports it.
import { cpSync, rmSync } from 'node:fs';

rmSync('dist/src/generated', { recursive: true, force: true });
cpSync('src/generated', 'dist/src/generated', { recursive: true });
