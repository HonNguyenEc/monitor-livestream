import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

import { ErrorMessage } from '../constants/error-messages.constants';

/** For partial bodies whose fields are not nullable: PartialType's IsOptional lets null through validation. */
@Injectable()
export class RejectNullFieldsPipe implements PipeTransform<object> {
  transform(body: object): object {
    const nullFields = Object.entries(body ?? {})
      .filter(([, value]) => value === null)
      .map(([field]) => ErrorMessage.fieldMustNotBeNull(field));
    if (nullFields.length > 0) {
      throw new BadRequestException(nullFields);
    }
    return body;
  }
}
