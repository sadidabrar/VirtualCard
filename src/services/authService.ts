import type { UserRepository } from '../repositories/userRepository.js';
import type { SafeUser, UsernameAvailabilityResult } from '../types/domain.js';
import type { SignupBody } from '../validators/auth.js';
import { validateUsernameRules } from '../validators/common.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { buildSocialsJson } from '../lib/sanitize.js';
import { processAndSaveAvatar, deleteAvatarFile } from '../lib/avatar.js';
import { AuthError, ConflictError } from '../types/errors.js';

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly uploadDir: string
  ) {}

  checkUsernameAvailability(rawUsername: string): UsernameAvailabilityResult {
    const check = validateUsernameRules(rawUsername);
    if (!check.valid) {
      return {
        available: false,
        username: check.username,
        reason: check.error,
      };
    }

    const existing = this.userRepo.findByUsername(check.username);
    if (existing) {
      return {
        available: false,
        username: check.username,
        reason: 'This username is already taken.',
      };
    }

    return {
      available: true,
      username: check.username,
    };
  }

  async signup(
    input: SignupBody,
    avatarFile?: Express.Multer.File
  ): Promise<{ userId: number; username: string }> {
    const existingByUsername = this.userRepo.findByUsername(input.username);
    if (existingByUsername) {
      throw new ConflictError(
        `Username "${input.username}" is already taken.`,
        'USERNAME_TAKEN',
        'username'
      );
    }

    const existingByEmail = this.userRepo.findByEmail(input.email);
    if (existingByEmail) {
      throw new ConflictError(
        'An account with this email address already exists.',
        'EMAIL_TAKEN',
        'email'
      );
    }

    let avatarUrl = '';
    if (avatarFile) {
      avatarUrl = await processAndSaveAvatar(avatarFile, this.uploadDir);
    }

    const socialsJson = buildSocialsJson({
      linkedin: input.social_linkedin,
      github: input.social_github,
      x: input.social_x,
      instagram: input.social_instagram,
      facebook: input.social_facebook,
      telegram: input.social_telegram,
      youtube: input.social_youtube,
    });

    try {
      const passwordHash = await hashPassword(input.password);
      const now = new Date().toISOString();

      const { userId } = this.userRepo.createUserWithCard(
        {
          username: input.username,
          email: input.email,
          password_hash: passwordHash,
          role: 'owner',
          status: 'active',
          created_at: now,
          updated_at: now,
        },
        {
          full_name: input.full_name,
          job_title: input.job_title,
          company: input.company,
          tagline: input.tagline,
          phone: input.phone,
          whatsapp: input.whatsapp,
          public_email: input.public_email,
          website: input.website,
          socials: socialsJson,
          avatar_url: avatarUrl,
          theme: input.theme,
          is_published: true,
          created_at: now,
          updated_at: now,
        }
      );

      return { userId, username: input.username };
    } catch (err) {
      if (avatarUrl) {
        await deleteAvatarFile(avatarUrl, this.uploadDir);
      }

      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE constraint failed: users.username')) {
        throw new ConflictError(
          `Username "${input.username}" was just claimed by someone else. Please pick another.`,
          'USERNAME_TAKEN',
          'username'
        );
      }
      if (msg.includes('UNIQUE constraint failed: users.email')) {
        throw new ConflictError(
          'An account with this email address already exists.',
          'EMAIL_TAKEN',
          'email'
        );
      }
      throw err;
    }
  }

  async login(identifier: string, password: string): Promise<SafeUser> {
    const user = this.userRepo.findByUsernameOrEmail(identifier);
    if (!user) {
      throw new AuthError(
        'Invalid credentials. Please check your username/email and password.',
        401,
        'INVALID_CREDENTIALS'
      );
    }

    const valid = await verifyPassword(user.password_hash, password);
    if (!valid) {
      throw new AuthError(
        'Invalid credentials. Please check your username/email and password.',
        401,
        'INVALID_CREDENTIALS'
      );
    }

    if (user.status === 'suspended') {
      throw new AuthError(
        'This account has been suspended. Please contact support.',
        403,
        'ACCOUNT_SUSPENDED'
      );
    }

    const { password_hash: _ignored, ...safeUser } = user;
    return safeUser;
  }
}
