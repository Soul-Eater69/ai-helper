import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  settingsSchema,
  savedSessionSchema,
  type Settings,
  type SavedSession,
} from '../shared/contracts';
interface Codec {
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
}
const vaultSchema = z.object({
  key: z.string().default(''),
  deepgramKey: z.string().default(''),
  settings: settingsSchema,
  sessions: z.array(savedSessionSchema).max(50),
});
type VaultData = z.infer<typeof vaultSchema>;
export class Vault {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file: string;
  constructor(
    private directory: string,
    private codec: Codec,
  ) {
    this.file = join(directory, 'vault.bin');
  }
  private async read(): Promise<VaultData> {
    try {
      return vaultSchema.parse(JSON.parse(this.codec.decrypt(await readFile(this.file))));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { key: '', deepgramKey: '', settings: settingsSchema.parse({}), sessions: [] };
      throw new Error(
        'Local storage could not be read. Back up vault.bin in the application data folder before resetting it.',
      );
    }
  }
  private mutate(fn: (value: VaultData) => void): Promise<void> {
    const write = this.queue.then(async () => {
      const data = await this.read();
      fn(data);
      await mkdir(this.directory, { recursive: true });
      const bytes = this.codec.encrypt(JSON.stringify(vaultSchema.parse(data)));
      await writeFile(`${this.file}.tmp`, bytes, { mode: 0o600 });
      await rename(`${this.file}.tmp`, this.file);
    });
    this.queue = write.catch(() => undefined);
    return write;
  }
  async key(): Promise<string> {
    await this.queue;
    return (await this.read()).key;
  }
  async deepgramKey(): Promise<string> {
    await this.queue;
    return (await this.read()).deepgramKey;
  }
  setDeepgramKey(key: string): Promise<void> {
    return this.mutate((v) => {
      v.deepgramKey = key;
    });
  }
  async settings(): Promise<Settings> {
    await this.queue;
    return (await this.read()).settings;
  }
  async sessions(): Promise<SavedSession[]> {
    await this.queue;
    return (await this.read()).sessions;
  }
  setKey(key: string): Promise<void> {
    return this.mutate((v) => {
      v.key = key;
    });
  }
  saveSettings(settings: Settings): Promise<void> {
    return this.mutate((v) => {
      v.settings = settingsSchema.parse(settings);
    });
  }
  saveSession(session: SavedSession): Promise<void> {
    return this.mutate((v) => {
      if (v.settings.saveHistory)
        v.sessions = [
          savedSessionSchema.parse(session),
          ...v.sessions.filter((s) => s.id !== session.id),
        ].slice(0, 50);
    });
  }
  deleteSession(id: string): Promise<void> {
    return this.mutate((v) => {
      v.sessions = v.sessions.filter((s) => s.id !== id);
    });
  }
}
