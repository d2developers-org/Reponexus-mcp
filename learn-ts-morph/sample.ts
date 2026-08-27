import { User } from './user';

export interface AuthContext {
  token: string;
  userId: number;
}

export class AuthService {
  constructor() {}

  public login(username: string): void {
    console.log(`Logging in ${username}`);
    this.verifyCredentials();
  }

  private verifyCredentials(): boolean {
    return true;
  }
}

export function generateToken(user: any): string {
  return "abc-123-xyz";
}
