import { Injectable } from '@nestjs/common';
import { Socket } from 'node:net';

@Injectable()
export class LanPrinterAdapter {
  async send(input: { host: string; port: number; bytes: Buffer; timeoutMs?: number }) {
    const timeoutMs = input.timeoutMs ?? 3000;
    await new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      socket.setTimeout(timeoutMs);
      socket.once('timeout', () => finish(new Error(`LAN printer timeout after ${timeoutMs}ms`)));
      socket.once('error', (error) => finish(error));
      socket.connect(input.port, input.host, () => {
        socket.write(input.bytes, (error) => {
          if (error) {
            finish(error);
            return;
          }
          socket.end(() => finish());
        });
      });
    });
  }
}
