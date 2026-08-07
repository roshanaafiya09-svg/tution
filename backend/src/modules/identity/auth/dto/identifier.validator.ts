import {
  registerDecorator,
  type ValidationOptions,
  type ValidationArguments,
} from 'class-validator';
import { isEmail, isPhoneNumber } from 'class-validator';

/**
 * A login identifier is valid if it's either a real E.164 phone number
 * or a real email address — the same two shapes identifier.util.ts
 * discriminates on. Written as one decorator rather than a pair of
 * @ValidateIf branches so the failure message names both options.
 */
export function IsLoginIdentifier(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLoginIdentifier',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          const trimmed = value.trim();
          return trimmed.includes('@')
            ? isEmail(trimmed)
            : isPhoneNumber(trimmed);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid email address or E.164 phone number, e.g. +919876543210`;
        },
      },
    });
  };
}
