/**
 * ⏱️🦀 Clawck — Stdin Reader
 * Reads JSON from stdin with timeout protection.
 */

export function readStdin(timeoutMs = 1000): Promise<string> {
  // No piped data if running in a TTY
  if (process.stdin.isTTY) {
    return Promise.resolve('');
  }

  return new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      process.stdin.removeAllListeners();
      resolve(Buffer.concat(chunks).toString('utf-8'));
    };

    const timer = setTimeout(finish, timeoutMs);

    process.stdin.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      clearTimeout(timer);
      finish();
    });

    process.stdin.on('error', () => {
      clearTimeout(timer);
      finish();
    });

    process.stdin.resume();
  });
}
