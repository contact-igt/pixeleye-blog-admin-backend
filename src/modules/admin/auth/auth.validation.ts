import { z } from 'zod';

const passwordSchema = z.string().min(8).max(128);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(191),
  password: z.string().min(1).max(128)
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(32).max(512).optional()
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: passwordSchema
}).refine((value) => value.current_password !== value.new_password, {
  path: ['new_password'],
  message: 'New password must be different from the current password'
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;


