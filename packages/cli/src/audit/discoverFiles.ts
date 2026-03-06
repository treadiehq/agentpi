import fg from 'fast-glob';
import { resolve } from 'path';

const IGNORE_DIRS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.git/**',
  '**/.turbo/**',
  '**/out/**',
];

export async function discoverFiles(targetPath: string): Promise<string[]> {
  const absPath = resolve(targetPath);

  const files = await fg(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
    cwd: absPath,
    absolute: true,
    ignore: IGNORE_DIRS,
    followSymbolicLinks: false,
  });

  return files.sort();
}
