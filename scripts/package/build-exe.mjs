import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { build } from 'esbuild';
import { inject } from 'postject';

import { EXE_DIR, EXE_NAME, ROOT, SEA_WORK_DIR, VERSION } from './package.constants.mjs';

// The executable embeds the node.exe running this script, so it must match the bundle target.
const NODE_MAJOR = 24;
const runningMajor = Number(process.versions.node.split('.')[0]);
if (runningMajor !== NODE_MAJOR) {
  throw new Error(
    `Node ${NODE_MAJOR} is required to build the executable, but this is Node ${process.versions.node}. ` +
      `Run npm run package with Node ${NODE_MAJOR}.`,
  );
}

const require = createRequire(import.meta.url);
const { SWAGGER_UI_FOLDER } = require(join(ROOT, 'dist', 'openapi', 'openapi.constants.js'));

// Fixed by Node for every single executable application.
const SEA_RESOURCE = 'NODE_SEA_BLOB';
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

// Nest requires these lazily inside try/catch. None resolves (class-transformer is installed but has no
// `storage` subpath), so a run from source skips them too.
const OPTIONAL_PACKAGES = [
  '@fastify/view',
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/platform-express',
  '@nestjs/websockets/socket-module',
  'class-transformer/storage',
];

const PE_HEADER_POINTER_OFFSET = 0x3c;
const PE_SIGNATURE = 'PE\0\0';
const PE_SIGNATURE_AND_FILE_HEADER_BYTES = 24;
const SUBSYSTEM_OFFSET = 68;
const PE32_PLUS_MAGIC = 0x20b;
const DATA_DIRECTORIES_OFFSET_PE32 = 96;
const DATA_DIRECTORIES_OFFSET_PE32_PLUS = 112;
const CERTIFICATE_DIRECTORY_INDEX = 4;
const DATA_DIRECTORY_BYTES = 8;
const DATA_DIRECTORY_SIZE_OFFSET = 4;
const PE_SUBSYSTEM_GUI = 2;

function optionalHeaderOffset(image, exePath) {
  const peOffset = image.readUInt32LE(PE_HEADER_POINTER_OFFSET);
  if (image.toString('latin1', peOffset, peOffset + PE_SIGNATURE.length) !== PE_SIGNATURE) {
    throw new Error(`${exePath} is not a PE executable`);
  }
  return peOffset + PE_SIGNATURE_AND_FILE_HEADER_BYTES;
}

// Injecting into node.exe breaks its Authenticode signature, and a broken signature looks worse
// to antivirus than none at all.
function stripSignature(image, exePath) {
  const header = optionalHeaderOffset(image, exePath);
  const directories =
    header +
    (image.readUInt16LE(header) === PE32_PLUS_MAGIC
      ? DATA_DIRECTORIES_OFFSET_PE32_PLUS
      : DATA_DIRECTORIES_OFFSET_PE32);
  const entry = directories + CERTIFICATE_DIRECTORY_INDEX * DATA_DIRECTORY_BYTES;
  const certificateOffset = image.readUInt32LE(entry);
  const certificateSize = image.readUInt32LE(entry + DATA_DIRECTORY_SIZE_OFFSET);
  if (certificateSize === 0) {
    return image;
  }
  if (certificateOffset + certificateSize !== image.length) {
    throw new Error(`${exePath} has data after its signature; refusing to strip it`);
  }
  image.writeUInt32LE(0, entry);
  image.writeUInt32LE(0, entry + DATA_DIRECTORY_SIZE_OFFSET);
  return image.subarray(0, certificateOffset);
}

// A console-subsystem executable opens a console window when started at login.
function setGuiSubsystem(image, exePath) {
  image.writeUInt16LE(PE_SUBSYSTEM_GUI, optionalHeaderOffset(image, exePath) + SUBSYSTEM_OFFSET);
}

rmSync(SEA_WORK_DIR, { recursive: true, force: true });
rmSync(EXE_DIR, { recursive: true, force: true });
mkdirSync(SEA_WORK_DIR, { recursive: true });
mkdirSync(EXE_DIR, { recursive: true });

const bundlePath = join(SEA_WORK_DIR, 'main.cjs');
await build({
  entryPoints: [join(ROOT, 'dist', 'main.js')],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  target: `node${NODE_MAJOR}`,
  format: 'cjs',
  // Nest reads class names for module tokens and log contexts.
  keepNames: true,
  external: OPTIONAL_PACKAGES,
  define: { BUNDLED_VERSION: JSON.stringify(VERSION) },
  logLevel: 'warning',
});

const blobPath = join(SEA_WORK_DIR, 'sea-prep.blob');
const seaConfigPath = join(SEA_WORK_DIR, 'sea-config.json');
writeFileSync(
  seaConfigPath,
  JSON.stringify({ main: bundlePath, output: blobPath, disableExperimentalSEAWarning: true }),
);
execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], { stdio: 'inherit' });

const exePath = join(EXE_DIR, EXE_NAME);
// postject keeps the subsystem, so both patches go into the one in-memory copy of node.exe.
const image = readFileSync(process.execPath);
setGuiSubsystem(image, exePath);
writeFileSync(exePath, stripSignature(image, exePath));
await inject(exePath, SEA_RESOURCE, readFileSync(blobPath), { sentinelFuse: SEA_FUSE });

// swagger-ui-dist is @nestjs/swagger's dependency, not ours; resolve it the way that package does.
const requireFromSwagger = createRequire(require.resolve('@nestjs/swagger'));
cpSync(
  dirname(requireFromSwagger.resolve('swagger-ui-dist/package.json')),
  join(EXE_DIR, SWAGGER_UI_FOLDER),
  { recursive: true, filter: (source) => !source.endsWith('.map') },
);

console.log(`Built ${exePath} (version ${VERSION})`);
