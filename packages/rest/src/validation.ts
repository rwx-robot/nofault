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
  return (target, propertyKey) =>
    addRule(target, propertyKey, {
      name: 'min',
      check: (v) => typeof v === 'number' && v >= min,
      message: `must be >= ${min}`,
    });
}

export function Max(max: number): PropertyDecorator {
  return (target, propertyKey) =>
    addRule(target, propertyKey, {
      name: 'max',
      check: (v) => typeof v === 'number' && v <= max,
      message: `must be <= ${max}`,
    });
}

export function IsOptional(): PropertyDecorator {
  return (target, propertyKey) =>
    addRule(target, propertyKey, { name: 'optional', check: () => true, message: '' });
}

/**
 * 按 DTO 的属性声明类型把字符串强制转换成目标类型。
 *
 * 为什么必须有这一步：query string 里的值**永远是字符串**，
 * 而 DTO 声明的往往是 `number`。不强制的话 `@IsInt()` 会统统失败；
 * 更糟的是即便跳过校验，handler 拿到的 `req.page` 实际是 `"1"`，
 * 类型标着 number、运行时却是 string —— 这种谎一旦撒下，后面全是隐性 bug。
 *
 * 依赖 `emitDecoratorMetadata`；拿不到类型信息时原样返回（不猜、不报错）。
 */
export function coerceDtoFields(dtoClass: new () => object, plain: unknown): Record<string, unknown> {
  if (plain === null || typeof plain !== 'object') return {};
  const source = plain as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };
  const proto = dtoClass.prototype as object;
  for (const key of Object.keys(out)) {
    const type = Reflect.getMetadata('design:type', proto, key) as Function | undefined;
    const value = out[key];
    if (type === Number && typeof value === 'string') {
      const n = Number(value);
      if (!Number.isNaN(n)) out[key] = n;
      continue;
    }
    if (type === Boolean && typeof value === 'string') {
      out[key] = value === 'true' || value === '1';
    }
  }
  return out;
}

/** 校验一个普通对象是否满足 DTO 类上声明的规则 */
export function validateDto(dtoClass: new () => object, plain: unknown): ValidationError[] {
  if (plain === null || typeof plain !== 'object') {
    return [{ property: '_root', constraints: { isObject: 'body must be an object' } }];
  }
  const source = plain as Record<string, unknown>;
  const errors: ValidationError[] = [];
  const props: Array<string | symbol> = (Reflect.getMetadata(PROPS, dtoClass) as Array<string | symbol> | undefined) ?? [];

  for (const prop of props) {
    const key = String(prop);
    const list: Rule[] = (Reflect.getMetadata(`${RULES}:${key}`, dtoClass) as Rule[] | undefined) ?? [];
    if (list.length === 0) continue;

    const optional = list.some((r) => r.name === 'optional');
    const value = source[key];
    if ((value === undefined || value === null || value === '') && optional) continue;