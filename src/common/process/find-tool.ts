import { delimiter, join } from 'node:path';

import { isFile } from '../fs/is-file';
import { ExternalTool, toolFileName } from './external-tool';
import { TOOLS_FOLDER } from './process.constants';

const SURROUNDING_QUOTES = /^"|"$/g;

/** The tool in `<dataDir>/tools`, else on PATH; null when neither has it. */
export async function findTool(
  tool: ExternalTool,
  dataDir: string,
  pathEnv: string = process.env.PATH ?? '',
): Promise<string | null> {
  const file = toolFileName(tool);
  const folders = [join(dataDir, TOOLS_FOLDER), ...pathEnv.split(delimiter)];
  for (const folder of folders) {
    const clean = folder.replace(SURROUNDING_QUOTES, '');
    if (clean === '') continue;
    const candidate = join(clean, file);
    if (await isFile(candidate)) return candidate;
  }
  return null;
}
