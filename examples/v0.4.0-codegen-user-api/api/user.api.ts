/**
 * user 服务的 API 契约。
 *
 * **这是日常要改的那份文件**：改完之后跑
 * ```bash
 * npx nofaultctl generate api api/user.api.ts --out src --root-module
 * ```
 * 契约一行，业务零改动地多出 controller / service / module / dto。
 */
import {
  Api,
  Prefix,
  Middleware,
  Get,
  Post,
  Delete,
  Handler,
  Body,
  Query,
  Path,
  IsString,
  IsInt,
  IsNotEmpty,
  IsEmail,
  MinLength,
  MaxLength,
  Min,
  Max,
  Optional,
} from '@nofault/dsl';

/** 创建用户的请求体 */