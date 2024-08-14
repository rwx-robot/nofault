/**
 * 用 @nofault/micro 提供的原语写业务：Snowflake ID、分布式锁、事件总线。
 *
 * 这些能力在前面的版本里都没有，以前要么自己写、要么直接省掉
 * （省掉的后果通常是"上线三个月后才在某个偶发场景炸掉"）。
 */
import { Injectable, Module } from '@nofault/core';
import {
  Column,
  Entity,
  InjectRepository,
  MemoryDataSource,
  OrmModule,
  PrimaryGeneratedColumn,
  Repository,
} from '@nofault/orm';
import { MemoryCache } from '@nofault/cache';
import { EventBus, Snowflake, DistributedLock, MemoryLockBackend } from '@nofault/micro';
import { Body, Controller, Get, Param, Post, HttpException, Ctx, RestContext } from '@nofault/rest';

export const TOPIC_ORDER_CREATED = 'order.created';
