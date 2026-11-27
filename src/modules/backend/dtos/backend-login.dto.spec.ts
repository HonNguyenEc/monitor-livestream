import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { BackendLoginDto } from './backend-login.dto';

const parse = (body: object): BackendLoginDto => plainToInstance(BackendLoginDto, body);

describe('BackendLoginDto', () => {
  it('trims the whitespace around the email before validating it', async () => {
    const dto = parse({ email: '  admin@example.com \n', password: 'pw' });

    expect(dto.email).toBe('admin@example.com');
    expect(await validate(dto)).toEqual([]);
  });

  it.each([['   '], [42]])('still rejects an email of %p', async (email) => {
    expect(await validate(parse({ email, password: 'pw' }))).not.toEqual([]);
  });

  it('keeps the password as typed', () => {
    expect(parse({ email: 'a@b.co', password: ' pw ' }).password).toBe(' pw ');
  });
});
