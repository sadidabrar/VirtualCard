import { z } from 'zod';
import { updateCardBodySchema } from './card.js';

export const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid user ID.'),
});

export const masterListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  status: z.enum(['all', 'active', 'suspended']).optional().default('all'),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  limit: z.coerce.number().int().min(5).max(100).optional().default(20),
});

export const masterUpdateUserCardSchema = updateCardBodySchema.extend({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid account email address.')
    .max(254),
  role: z.enum(['owner', 'master']),
  status: z.enum(['active', 'suspended']),
});

export const masterUpdateStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
  redirect_to: z.enum(['list', 'detail']).optional(),
});

export const masterResetPasswordSchema = z
  .object({
    new_password: z
      .string()
      .min(8, 'New password must be at least 8 characters long.')
      .max(128, 'Password cannot exceed 128 characters.'),
    confirm_password: z.string().optional(),
  })
  .refine(
    (data) => data.confirm_password === undefined || data.new_password === data.confirm_password,
    {
      message: 'New password and confirmation do not match.',
      path: ['confirm_password'],
    }
  );

export type MasterListQuery = z.infer<typeof masterListQuerySchema>;
export type MasterUpdateUserCardBody = z.infer<typeof masterUpdateUserCardSchema>;
export type MasterUpdateStatusBody = z.infer<typeof masterUpdateStatusSchema>;
export type MasterResetPasswordBody = z.infer<typeof masterResetPasswordSchema>;
