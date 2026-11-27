import { MODULE_METADATA } from '@nestjs/common/constants';

import { DetectionStateModule } from './detection-state.module';

describe('DetectionStateModule', () => {
  it('imports no module, so any module can depend on it without a cycle', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, DetectionStateModule)).toBeUndefined();
  });
});
