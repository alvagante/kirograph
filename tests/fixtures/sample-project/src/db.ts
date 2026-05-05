import { AuthService } from './auth';

export class DatabasePool {
  private auth = new AuthService();

  query(sql: string): unknown[] {
    return [];
  }

  authenticate(token: string): boolean {
    return this.auth.validateToken(token);
  }
}
