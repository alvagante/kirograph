/**
 * Authentication utilities.
 */

export class AuthService {
  validateToken(token: string): boolean {
    return token.length > 0;
  }

  hashPassword(pwd: string): string {
    return pwd + '_hashed';
  }
}

export function createToken(userId: string): string {
  return 'tok_' + userId;
}
