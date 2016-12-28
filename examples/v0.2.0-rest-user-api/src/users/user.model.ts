export interface User {
  id: number;
  name: string;
  email: string;
  age: number;
}

/** 内存存储（v0.5.0 会换成 @nofault/sqlx） */
const store = new Map<number, User>();
let seq = 0;

export function nextId(): number {
  return ++seq;
}

export function findAll(): User[] {
  return [...store.values()];
}

export function findById(id: number): User | undefined {
  return store.get(id);
}

export function findByEmail(email: string): User | undefined {
  return [...store.values()].find((u) => u.email === email);
}

export function save(user: User): User {
  store.set(user.id, user);
  return user;
}

export function remove(id: number): boolean {
  return store.delete(id);
}

/** 测试用：清空数据 */
export function reset(): void {
  store.clear();
  seq = 0;
}
