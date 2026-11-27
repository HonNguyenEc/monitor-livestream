import { Global, Module } from '@nestjs/common';

import { resolveDataDir } from './runtime-paths';

export const DATA_DIR = Symbol('DATA_DIR');

@Global()
@Module({
  providers: [{ provide: DATA_DIR, useFactory: resolveDataDir }],
  exports: [DATA_DIR],
})
export class DataDirModule {}
