import { Request } from 'express';

export interface UserTokenPayload {
  id: number;
  username: string;
}

export interface AuthRequest extends Request {
  user?: UserTokenPayload;
}
