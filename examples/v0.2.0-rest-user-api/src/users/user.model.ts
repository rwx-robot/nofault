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