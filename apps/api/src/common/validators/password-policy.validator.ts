import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { COMMON_PASSWORDS } from './common-passwords.js';

export function isStrongPassword(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }

  const minLength = 10;
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);

  return value.length >= minLength && hasLower && hasUpper && hasNumber && hasSymbol;
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: Object | undefined, propertyName: string) {
    const target = object ? object.constructor : Object;
    registerDecorator({
      name: 'isStrongPassword',
      target,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isStrongPassword(value) && !COMMON_PASSWORDS.includes(String(value).toLowerCase());
        },
        defaultMessage(args: ValidationArguments) {
          const value = String(args.value ?? '');
          if (COMMON_PASSWORDS.includes(value.toLowerCase())) {
            return 'Password is too common. Choose a less predictable password.';
          }
          return 'Password must be at least 10 characters long and include uppercase, lowercase, number, and symbol.';
        },
      },
    });
  };
}
