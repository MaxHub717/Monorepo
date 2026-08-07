declare module '../../common/validators/index.js' {
  import { ValidationOptions } from 'class-validator';
  export function IsStrongPassword(validationOptions?: ValidationOptions): PropertyDecorator;
  export const COMMON_PASSWORDS: string[];
}

declare module '../../common/validators' {
  import { ValidationOptions } from 'class-validator';
  export function IsStrongPassword(validationOptions?: ValidationOptions): PropertyDecorator;
  export const COMMON_PASSWORDS: string[];
}
