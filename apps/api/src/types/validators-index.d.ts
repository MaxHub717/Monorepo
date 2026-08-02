declare module '../../common/validators/index.js' {
  import { ValidationOptions } from 'class-validator';
  export function IsStrongPassword(validationOptions?: ValidationOptions): PropertyDecorator;
}
