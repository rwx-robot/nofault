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
  });

  it('reports every failing constraint', () => {
    const errors = validateDto(DemoDto, { name: 'X', email: 'bad', age: 999 });
    expect(errors).toHaveLength(3);
    const byProp = Object.fromEntries(errors.map((e) => [e.property, Object.keys(e.constraints)]));
    expect(byProp.name).toContain('minLength');
    expect(byProp.email).toContain('isEmail');
    expect(byProp.age).toContain('max');
  });

  it('reports missing fields', () => {
    const errors = validateDto(DemoDto, {});
    expect(errors.map((e) => e.property).sort()).toEqual(['age', 'email', 'name']);
  });

  it('rejects non-object bodies', () => {
    expect(validateDto(DemoDto, null)).toHaveLength(1);
  });
});
