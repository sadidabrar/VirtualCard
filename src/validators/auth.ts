import { z } from 'zod';
import {
  usernameSchema,
  optionalHttpUrlSchema,
  optionalEmailSchema,
  hexColorSchema,
} from './common.js';

export const usernameQuerySchema = z.object({
  u: z.string().trim().min(1, 'Query parameter "u" is required.').max(64),
});

export const usernameParamSchema = z.object({
  username: usernameSchema,
});

export const avatarFilenameParamSchema = z.object({
  filename: z
    .string()
    .trim()
    .regex(/^avatar-[a-f0-9]{32}\.webp$/, 'Invalid avatar filename.'),
});

export const signupBodySchema = z
  .object({
    username: usernameSchema,
    email: z.string().trim().toLowerCase().max(254).email('Please enter a valid email address.'),
    password: z.string().min(8, 'Password must be at least 8 characters long.').max(128),
    confirm_password: z.string().min(1, 'Please confirm your password.').max(128),
    full_name: z.string().trim().min(2, 'Full Name is required (at least 2 characters).').max(100),
    job_title: z.string().trim().max(100).optional().default(''),
    company: z.string().trim().max(100).optional().default(''),
    tagline: z.string().trim().max(200).optional().default(''),
    phone: z
      .string()
      .trim()
      .max(32)
      .optional()
      .default('')
      .transform((v) => v.replace(/[^\d+\-\s().]/g, '')),
    whatsapp: z
      .string()
      .trim()
      .max(32)
      .optional()
      .default('')
      .transform((v) => v.replace(/[^\d+\-\s().]/g, '')),
    public_email: optionalEmailSchema,
    website: optionalHttpUrlSchema,
    theme: hexColorSchema.optional().default('#38bdf8'),
    social_linkedin: optionalHttpUrlSchema,
    social_github: optionalHttpUrlSchema,
    social_x: optionalHttpUrlSchema,
    social_instagram: optionalHttpUrlSchema,
    social_facebook: optionalHttpUrlSchema,
    social_telegram: optionalHttpUrlSchema,
    social_youtube: optionalHttpUrlSchema,
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Password and confirmation do not match.',
    path: ['confirm_password'],
  });

export const loginBodySchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Please enter your username or email.')
    .max(254)
    .toLowerCase(),
  password: z.string().min(1, 'Please enter your password.').max(128),
});

export type SignupBody = z.infer<typeof signupBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
