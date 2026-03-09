import fg from 'fast-glob';
import { resolve } from 'path';
import { existsSync, statSync } from 'fs';

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

const GLOB_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.mjs',
  '**/*.cjs',
];

export function ensurePathExists(absPath: string, userPath: string): void {
  if (!existsSync(absPath)) {
    throw new Error(`Path does not exist: ${userPath}`);
  }
  if (!statSync(absPath).isDirectory()) {
    throw new Error(`Path is not a directory: ${userPath}`);
  }
}

export async function discoverFiles(targetPath: string): Promise<string[]> {
  const absPath = resolve(targetPath);

  ensurePathExists(absPath, targetPath);

  const files = await fg(GLOB_PATTERNS, {
    cwd: absPath,
    absolute: true,
    ignore: IGNORE_DIRS,
    followSymbolicLinks: false,
  });

  return files.sort();
}
