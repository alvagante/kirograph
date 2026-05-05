import { DatabasePool } from './db';
import { createToken } from './auth';

export function createRouter(pool: DatabasePool): { token: string } {
  const token = createToken('admin');
  pool.query('SELECT 1');
  return { token };
}

export function healthCheck(): boolean {
  return true;
}
