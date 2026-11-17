import bcrypt from 'bcryptjs';
import { HttpError } from '../../lib/http-error.js';
import { User, toUserDto, type UserDto } from './user.model.js';
import type { LoginBody } from './auth.schema.js';

export const BCRYPT_COST = 12;

// Compared against when the email is unknown so both paths cost one bcrypt round —
// response timing does not reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('caretrack-timing-equaliser', BCRYPT_COST);

export async function authenticateCredentials({ email, password }: LoginBody): Promise<UserDto> {
  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    throw HttpError.unauthorized('Incorrect email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();
  return toUserDto(user);
}

export async function getUserById(id: string): Promise<UserDto> {
  const user = await User.findById(id);
  if (!user) throw HttpError.unauthorized('Account no longer exists');
  return toUserDto(user);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}
