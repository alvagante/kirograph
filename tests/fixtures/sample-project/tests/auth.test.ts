import { AuthService, createToken } from '../src/auth';

describe('AuthService', () => {
  it('validates a non-empty token', () => {
    const svc = new AuthService();
    expect(svc.validateToken('abc')).toBe(true);
  });

  it('rejects an empty token', () => {
    const svc = new AuthService();
    expect(svc.validateToken('')).toBe(false);
  });

  it('hashes a password', () => {
    const svc = new AuthService();
    expect(svc.hashPassword('secret')).toBe('secret_hashed');
  });
});

describe('createToken', () => {
  it('returns a prefixed token', () => {
    expect(createToken('user1')).toBe('tok_user1');
  });
});
