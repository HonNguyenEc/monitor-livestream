import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class BackendLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
