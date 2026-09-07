import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ProductError } from './errors.js';

let boot: string | undefined;
let darwin: { read: (pid: number, flavor: number, arg: number, buffer: Buffer, size: number) => number; errno: () => number } | undefined;

// Kernel birth values avoid the one-second rounding in ps's lstart column.
// Linux: https://www.kernel.org/doc/html/latest/filesystems/proc.html
// Darwin ABI: https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info.h
export function processIdentity(pid: number): string | null {
  try {
    if (process.platform === 'linux') {
      boot ??= readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      // The parenthesized command can itself contain spaces and parentheses.
      const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
      if (!/^\d+$/.test(fields[19] ?? '')) throw new Error('Malformed process stat.');
      if (fields[0] === 'Z' || fields[0] === 'X') return null;
      return Buffer.from(`linux:${boot}:${fields[19]}`).toString('hex');
    }
    if (process.platform === 'darwin') {
      if (!darwin) {
        const koffi = createRequire(import.meta.url)('koffi') as typeof import('koffi');
        darwin = { read: koffi.load('/usr/lib/libproc.dylib').func('int proc_pidinfo(int pid, int flavor, uint64_t arg, _Out_ void *buffer, int buffersize)'), errno: koffi.errno };
      }
      // PROC_PIDTBSDINFO (3) returns the fixed 136-byte proc_bsdinfo ABI on
      // macOS arm64/x64. The last two uint64 fields retain microsecond birth time.
      const info = Buffer.alloc(136);
      const size = darwin.read(pid, 3, 0, info, info.length);
      if (size === 0 && darwin.errno() === 3) return null; // ESRCH
      if (size !== info.length || info.readUInt32LE(12) !== pid) throw new Error('Cannot read process birth information.');
      if (info.readUInt32LE(4) === 5) return null; // SZOMB
      return Buffer.from(`darwin:${info.readBigUInt64LE(120)}:${info.readBigUInt64LE(128)}`).toString('hex');
    }
    throw new Error('Process identity requires macOS or Linux.');
  } catch (error) {
    if (process.platform === 'linux' && ['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      // A missing procfs mount or boot identity must not look like a dead PID.
      if ((error as NodeJS.ErrnoException).path === `/proc/${pid}/stat`) return null;
    }
    throw new ProductError('PROCESS_STATE', 'Cannot establish process identity; recovery remains blocked.', (error as Error).message);
  }
}
