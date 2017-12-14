import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { IsEmail, IsInt, IsNotEmpty, Max, Min, MinLength, validateDto } from '../src/validation';

class DemoDto {
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsInt()
  @Min(0)
  @Max(150)
  age!: number;
}

describe('validateDto', () => {
  it('passes a valid object', () => {
    expect(validateDto(DemoDto, { name: 'Ada', email: 'ada@x.dev', age: 36 })).toEqual([]);