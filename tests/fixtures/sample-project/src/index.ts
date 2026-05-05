import { DatabasePool } from './db';
import { createRouter } from './api';

const pool = new DatabasePool();
export const app = createRouter(pool);
