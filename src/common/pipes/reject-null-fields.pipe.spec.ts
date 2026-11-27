import { BadRequestException } from '@nestjs/common';

import { RejectNullFieldsPipe } from './reject-null-fields.pipe';

describe('RejectNullFieldsPipe', () => {
  const pipe = new RejectNullFieldsPipe();

  it('returns a body without nulls as it is', () => {
    const body = { gap: 0, name: '' };

    expect(pipe.transform(body)).toBe(body);
  });

  it('rejects every null field in one error', () => {
    expect.assertions(2);
    try {
      pipe.transform({ gap: null, rows: 2, columns: null });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: ['gap must not be null', 'columns must not be null'],
      });
    }
  });

  it('lets an empty or missing body through', () => {
    expect(pipe.transform({})).toEqual({});
    expect(pipe.transform(undefined as unknown as object)).toBeUndefined();
  });
});
