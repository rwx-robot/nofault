import { IsEmail, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min, MinLength } from '@nofault/rest';

/**
 * 创建用户的 DTO。
 *
 * 校验规则用装饰器声明，由 `ValidateBody(CreateUserDto)` 在 handler 执行前触发。
 */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(32)