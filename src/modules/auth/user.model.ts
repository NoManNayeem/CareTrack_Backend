import { model, Schema, type Types } from 'mongoose';

export const ROLES = ['admin'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'admin', required: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

export const User = model('User', userSchema);

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastLoginAt: Date | null;
}

export function toUserDto(user: {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: Role;
  lastLoginAt?: Date | null;
}): UserDto {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}
