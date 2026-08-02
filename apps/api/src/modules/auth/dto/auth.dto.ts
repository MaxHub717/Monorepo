import { IsEmail, IsNotEmpty, IsOptional, IsString, registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

function isStrongPasswordLocal(value: unknown) {
  if (typeof value !== 'string') return false;
  const minLength = 10;
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);
  return value.length >= minLength && hasLower && hasUpper && hasNumber && hasSymbol;
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isStrongPasswordLocal(value);
        },
        defaultMessage(args: ValidationArguments) {
          return 'Password must be at least 10 characters long and include uppercase, lowercase, number, and symbol.';
        },
      },
    });
  };
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsStrongPassword({
    message:
      'Password must be at least 10 characters long, include uppercase, lowercase, number, symbol, and not be a common password.',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  gamerTag!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsStrongPassword({
    message:
      'Password must be at least 10 characters long, include uppercase, lowercase, number, symbol, and not be a common password.',
  })
  password!: string;
}
