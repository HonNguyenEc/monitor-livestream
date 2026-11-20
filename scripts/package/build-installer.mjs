import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  EXE_DIR,
  EXE_NAME,
  INSTALLER_BASENAME,
  INSTALLER_DIR,
  MANIFEST_FILE,
  ROOT,
  VERSION,
} from './package.constants.mjs';

const ISS_PATH = join(ROOT, 'scripts', 'package', 'installer.iss');
const INNO_FOLDER = 'Inno Setup 6';
const ISCC_EXE = 'ISCC.exe';
const ISCC_CANDIDATES = [
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', INNO_FOLDER, ISCC_EXE),
  process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], INNO_FOLDER, ISCC_EXE),
  process.env.ProgramFiles && join(process.env.ProgramFiles, INNO_FOLDER, ISCC_EXE),
].filter(Boolean);
const JSON_INDENT = 2;
// Mirrors livestream-backend's LIVE_QC_INSTALLER_FILE_NAME_PATTERN and _MAX_LENGTH: it rejects a
// latest.json whose file_name breaks them.
const PUBLISHABLE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/;
const MAX_FILE_NAME_LENGTH = 255;

function findIscc() {
  const iscc = ISCC_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!iscc) {
    throw new Error(
      `${ISCC_EXE} not found in ${ISCC_CANDIDATES.join(', ')}. ` +
        'Install it with: winget install JRSoftware.InnoSetup --scope user',
    );
  }
  return iscc;
}

function assertPublishable(fileName) {
  if (!PUBLISHABLE_FILE_NAME.test(fileName) || fileName.length > MAX_FILE_NAME_LENGTH) {
    throw new Error(
      `${fileName} cannot be published: livestream-backend accepts only letters, digits, ` +
        `dot, underscore, hyphen and space, up to ${MAX_FILE_NAME_LENGTH} characters. ` +
        'Change the version in package.json.',
    );
  }
}

const baseName = `${INSTALLER_BASENAME}-${VERSION}`;
const fileName = `${baseName}.exe`;
assertPublishable(fileName);

if (!existsSync(join(EXE_DIR, EXE_NAME))) {
  throw new Error(`${join(EXE_DIR, EXE_NAME)} is missing; run npm run package:exe first`);
}

rmSync(INSTALLER_DIR, { recursive: true, force: true });
mkdirSync(INSTALLER_DIR, { recursive: true });
execFileSync(
  findIscc(),
  [
    '/Q',
    `/DAppVersion=${VERSION}`,
    `/DSourceDir=${EXE_DIR}`,
    `/DExeName=${EXE_NAME}`,
    `/DOutputDir=${INSTALLER_DIR}`,
    `/DOutputBaseFilename=${baseName}`,
    ISS_PATH,
  ],
  { stdio: 'inherit' },
);

const installer = readFileSync(join(INSTALLER_DIR, fileName));
const manifest = {
  version: VERSION,
  file_name: fileName,
  size_bytes: installer.length,
  sha256: createHash('sha256').update(installer).digest('hex'),
};
writeFileSync(
  join(INSTALLER_DIR, MANIFEST_FILE),
  `${JSON.stringify(manifest, null, JSON_INDENT)}\n`,
);

console.log(`Built ${join(INSTALLER_DIR, fileName)} and ${MANIFEST_FILE}`);
