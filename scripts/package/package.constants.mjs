import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const { version: VERSION } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const BUILD_DIR = join(ROOT, 'build');
export const SEA_WORK_DIR = join(BUILD_DIR, 'sea');
export const EXE_DIR = join(BUILD_DIR, 'exe');
export const EXE_NAME = 'live-qc-service.exe';
export const INSTALLER_DIR = join(BUILD_DIR, 'installer');
export const INSTALLER_BASENAME = 'LiveQC-Setup';
export const MANIFEST_FILE = 'latest.json';
