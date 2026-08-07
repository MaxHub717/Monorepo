declare module '../../common/validators/password-policy.validator.js' {
  import { ValidationOptions } from 'class-validator';
  export function IsStrongPassword(validationOptions?: ValidationOptions): PropertyDecorator;
}

declare module '../../common/validators/common-passwords.js' {
  export const COMMON_PASSWORDS: string[];
}
