import { Injectable } from '@nofault/core';
import { ConflictException, NotFoundException } from '@nofault/rest';
import { createLogger, type Logger } from '@nofault/logger';
import {
  findAll,
  findByEmail,
  findById,
  nextId,
  remove,
  save,
  type User,
} from './user.model';

@Injectable()
export class UserService {
  private readonly logger: Logger = createLogger({ context: 'UserService' });

  list(keyword?: string, limit = 20): User[] {
    const all = findAll();
    const filtered = keyword ? all.filter((u) => u.name.includes(keyword) || u.email.includes(keyword)) : all;
    return filtered.slice(0, limit);
  }

  get(id: number): User {
    const user = findById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  create(input: { name: string; email: string; age: number }): User {
    if (findByEmail(input.email)) {
      throw new ConflictException(`Email ${input.email} already registered`);
    }
    const user: User = { id: nextId(), ...input };
    save(user);
    this.logger.info('user created', { id: user.id });
    return user;
  }

  update(id: number, patch: Partial<Omit<User, 'id'>>): User {
    const user = this.get(id);
    const updated: User = { ...user, ...patch };
    save(updated);
    return updated;
  }

  delete(id: number): void {
    const user = this.get(id);
    remove(user.id);
    this.logger.info('user deleted', { id });
  }

  count(): number {
    return findAll().length;
  }
}
