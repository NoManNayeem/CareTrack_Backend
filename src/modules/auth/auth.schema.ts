import { z } from 'zod';

export const loginBody = z.object({
  email: z.email({ error: 'Enter a valid email address' }).trim().toLowerCase(),
  password: z.string().min(1, { error: 'Password is required' }).max(200),
});

export type LoginBody = z.infer<typeof loginBody>;
