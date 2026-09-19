import { registerDecorator } from 'class-validator';
import type { ValidationOptions } from 'class-validator';
import { isValidCalendarDate } from '../academic-week.util';

/** A `YYYY-MM-DD` string that is a real calendar date (not "2026-13-45"). */
export function IsCalendarDate(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a real calendar date in YYYY-MM-DD form`,
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isValidCalendarDate(value),
      },
    });
  };
}
