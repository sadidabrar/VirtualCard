import type { UserRepository } from '../repositories/userRepository.js';
import type { AdminUserWithCard, MasterDashboardMetrics } from '../types/domain.js';
import type { MasterListQuery, MasterUpdateUserCardBody } from '../validators/master.js';
import { buildSocialsJson } from '../lib/sanitize.js';
import { hashPassword } from '../lib/password.js';
import { deleteAvatarFile } from '../lib/avatar.js';
import { buildMasterExportCsv } from '../lib/csv.js';
import { ConflictError, NotFoundError, ValidationError } from '../types/errors.js';

export interface MasterDashboardResult {
  metrics: MasterDashboardMetrics;
  items: AdminUserWithCard[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  filters: {
    q: string;
    status: 'all' | 'active' | 'suspended';
  };
}

export class MasterService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly baseDomain: string,
    private readonly uploadDir: string
  ) {}

  getDashboard(query: MasterListQuery): MasterDashboardResult {
    const metrics = this.userRepo.getDashboardMetrics();
    const { items, totalCount } = this.userRepo.listUsersWithCards({
      q: query.q,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });

    const totalPages = Math.max(1, Math.ceil(totalCount / query.limit));

    return {
      metrics,
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalCount,
        totalPages,
      },
      filters: {
        q: query.q,
        status: query.status,
      },
    };
  }

  getUserDetail(id: number): AdminUserWithCard {
    const record = this.userRepo.findUserWithCardById(id);
    if (!record) {
      throw new NotFoundError('User account not found.', 'USER_NOT_FOUND');
    }
    return record;
  }

  updateUserAndCard(
    targetUserId: number,
    actingMasterId: number,
    input: MasterUpdateUserCardBody
  ): AdminUserWithCard {
    const existing = this.getUserDetail(targetUserId);

    if (actingMasterId === targetUserId) {
      if (input.status === 'suspended' || input.role !== 'master') {
        throw new ValidationError(
          'You cannot suspend or demote your own master administrator account.',
          'SELF_MODIFICATION_FORBIDDEN'
        );
      }
    }

    if (existing.user.role === 'master' && input.status === 'suspended') {
      throw new ValidationError(
        'Master administrator accounts cannot be suspended.',
        'CANNOT_SUSPEND_MASTER'
      );
    }

    if (input.email !== existing.user.email) {
      const emailOwner = this.userRepo.findByEmail(input.email);
      if (emailOwner && emailOwner.id !== targetUserId) {
        throw new ConflictError(
          'An account with this email address already exists.',
          'EMAIL_TAKEN',
          'email'
        );
      }
    }

    const now = new Date().toISOString();
    const socialsJson = buildSocialsJson(
      {
        linkedin: input.social_linkedin,
        github: input.social_github,
        x: input.social_x,
        instagram: input.social_instagram,
        facebook: input.social_facebook,
        telegram: input.social_telegram,
        youtube: input.social_youtube,
      },
      input.social_order
    );

    const updated = this.userRepo.updateUserAndCard(
      targetUserId,
      {
        email: input.email,
        role: input.role,
        status: input.status,
        updated_at: now,
      },
      {
        full_name: input.full_name,
        job_title: input.job_title,
        company: input.company,
        tagline: input.tagline,
        address: input.address,
        phone: input.phone,
        whatsapp: input.whatsapp,
        public_email: input.public_email,
        website: input.website,
        theme: input.theme,
        is_published: input.is_published,
        socials: socialsJson,
        updated_at: now,
      }
    );

    if (!updated) {
      throw new NotFoundError('User account not found.', 'USER_NOT_FOUND');
    }

    return updated;
  }

  setUserStatus(
    targetUserId: number,
    actingMasterId: number,
    status: 'active' | 'suspended'
  ): AdminUserWithCard {
    const existing = this.getUserDetail(targetUserId);

    if (actingMasterId === targetUserId && status === 'suspended') {
      throw new ValidationError(
        'You cannot suspend your own master administrator account.',
        'SELF_SUSPEND_FORBIDDEN'
      );
    }

    if (existing.user.role === 'master' && status === 'suspended') {
      throw new ValidationError(
        'Master administrator accounts cannot be suspended.',
        'CANNOT_SUSPEND_MASTER'
      );
    }

    this.userRepo.updateStatus(targetUserId, status, new Date().toISOString());
    return this.getUserDetail(targetUserId);
  }

  async resetPassword(targetUserId: number, newPassword: string): Promise<void> {
    this.getUserDetail(targetUserId);
    const passwordHash = await hashPassword(newPassword);
    this.userRepo.updatePasswordHash(targetUserId, passwordHash, new Date().toISOString());
  }

  async deleteUser(
    targetUserId: number,
    actingMasterId: number
  ): Promise<{ deletedUsername: string }> {
    const existing = this.getUserDetail(targetUserId);

    if (actingMasterId === targetUserId) {
      throw new ValidationError('You cannot delete your own account.', 'SELF_DELETE_FORBIDDEN');
    }

    if (existing.user.role === 'master') {
      throw new ValidationError(
        'Master administrator accounts cannot be deleted.',
        'CANNOT_DELETE_MASTER'
      );
    }

    const avatarUrl = existing.card?.avatar_url;
    const deletedUsername = existing.user.username;

    this.userRepo.deleteById(targetUserId);
    if (avatarUrl) {
      await deleteAvatarFile(avatarUrl, this.uploadDir);
    }

    return { deletedUsername };
  }

  exportCsv(): string {
    const rows = this.userRepo.listAllUsersWithCardsForExport();
    return buildMasterExportCsv(rows, this.baseDomain);
  }

  exportJson(): AdminUserWithCard[] {
    return this.userRepo.listAllUsersWithCardsForExport();
  }
}
