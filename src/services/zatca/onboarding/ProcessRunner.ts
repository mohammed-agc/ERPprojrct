/**
 * ProcessRunner — the process-execution AUTHORITY.
 *
 * A thin seam over "run an external program and collect its result". It exists
 * so higher authorities (e.g. OpenSslCsrGenerator) never touch child_process
 * directly: they depend on this contract, so they are unit-testable with a fake
 * runner and carry no knowledge of how a process is spawned.
 *
 * The default implementation uses spawn with an ARGV ARRAY (never a shell
 * string): no escaping pitfalls, spaces in paths are safe, and there is no shell
 * injection surface.
 */

import { spawn } from 'node:child_process';

export interface ProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessRunOptions {
  /** Bytes written to the child's stdin, if any (e.g. an OpenSSL config). */
  readonly stdin?: string | Buffer;
  /** Extra environment entries merged over process.env. */
  readonly env?: Record<string, string>;
  /** Working directory for the child. */
  readonly cwd?: string;
}

export class ProcessRunError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
    this.name = 'ProcessRunError';
  }
}

export interface ProcessRunner {
  readonly implementationName: string;
  /**
   * Run `executable` with `args`. Resolves with the exit code + captured
   * stdout/stderr. It does NOT throw on a non-zero exit code — a failed program
   * is a RESULT the caller interprets, not an exception. It rejects only when
   * the process cannot be spawned at all (e.g. executable not found).
   */
  run(
    executable: string,
    args: readonly string[],
    options?: ProcessRunOptions
  ): Promise<ProcessResult>;
}

export class SpawnProcessRunner implements ProcessRunner {
  readonly implementationName = 'SpawnProcessRunner (node:child_process spawn)';

  run(
    executable: string,
    args: readonly string[],
    options: ProcessRunOptions = {}
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [...args], {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('error', (err) => {
        // Could not spawn at all (e.g. ENOENT — executable not found).
        reject(
          new ProcessRunError(
            `failed to spawn '${executable}': ${err.message}`,
            err
          )
        );
      });

      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      if (options.stdin !== undefined) {
        child.stdin.write(options.stdin);
      }
      child.stdin.end();
    });
  }
}

export function createProcessRunner(): ProcessRunner {
  return new SpawnProcessRunner();
}
