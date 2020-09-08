/**
 * user 服务的 API 契约（v0.5.0）。
 *
 * 与 v0.4.0 那份相比只多了一件事：**DTO 同时被用作数据层的实体来源**。
 * 一份契约 → controller / service / module / dto / entity / repository。
 */
import {
  Api,
  Prefix,
  Get,
  Post,
  Delete,
  Handler,
  Body,
  Query,
  Path,
  IsString,
  IsInt,
  IsEmail,