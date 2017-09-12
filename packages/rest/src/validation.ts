import 'reflect-metadata';

/**
 * 极简校验器。
 *
 * 为什么不用 `class-validator`：它依赖较重且默认同步语义不直观。
 * v0.2.0 只需要"够用且零负担"的字段校验，因此自己实现一个 60 行的版本，
 * 语义与 class-validator 保持一致，未来可平滑替换。
 */

export interface ValidationError {
  property: string;
  constraints: Record<string, string>;
}

interface Rule {
  name: string;
  check: (v: unknown) => boolean;
  message: string;
}

const RULES = 'nofault:validation:rules';
const PROPS = 'nofault:validation:props';

function addRule(target: object, propertyKey: string | symbol, rule: Rule): void {
  const ctor = target.constructor;
  const key = `${RULES}:${String(propertyKey)}`;
  const list: Rule[] = (Reflect.getMetadata(key, ctor) as Rule[] | undefined) ?? [];
  list.push(rule);
  Reflect.defineMetadata(key, list, ctor);

  // 记录"声明过规则的属性名"。
  // 不能靠 `Object.keys(new Dto())` —— `name!: string` 这类字段没有初始化器，
  // 构造出来的实例上一个自有属性都没有。
  const props: Array<string | symbol> = (Reflect.getMetadata(PROPS, ctor) as Array<string | symbol> | undefined) ?? [];
  if (!props.includes(propertyKey)) {
    props.push(propertyKey);
    Reflect.defineMetadata(PROPS, props, ctor);
  }
}

function rule(name: string, check: (v: unknown) => boolean, message: string) {
  return (): PropertyDecorator =>
    (target, propertyKey) => {
      addRule(target, propertyKey, { name, check, message });
    };
}

export const IsString = rule('isString', (v) => typeof v === 'string', 'must be a string');
export const IsNumber = rule('isNumber', (v) => typeof v === 'number' && !Number.isNaN(v), 'must be a number');
export const IsInt = rule('isInt', (v) => Number.isInteger(v), 'must be an integer');
export const IsBoolean = rule('isBoolean', (v) => typeof v === 'boolean', 'must be a boolean');
export const IsEmail = rule('isEmail', (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'must be an email');
export const IsNotEmpty = rule('isNotEmpty', (v) => v !== undefined && v !== null && v !== '', 'must not be empty');

export function MinLength(min: number): PropertyDecorator {
  return (target, propertyKey) =>
    addRule(target, propertyKey, {
      name: 'minLength',
      check: (v) => typeof v === 'string' && v.length >= min,
      message: `must be at least ${min} characters`,
    });
}

export function MaxLength(max: number): PropertyDecorator {
  return (target, propertyKey) =>
    addRule(target, propertyKey, {
      name: 'maxLength',
      check: (v) => typeof v === 'string' && v.length <= max,
      message: `must be at most ${max} characters`,
    });
}

export function Min(min: number): PropertyDecorator {