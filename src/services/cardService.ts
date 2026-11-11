import type { CardRepository } from '../repositories/cardRepository.js';
import type { Card } from '../db/schema.js';
import type { UpdateCardBody } from '../validators/card.js';
import { buildSocialsJson } from '../lib/sanitize.js';
import { deleteAvatarFile, processAndSaveAvatar } from '../lib/avatar.js';
import { NotFoundError } from '../types/errors.js';

export class CardService {
  constructor(
    private readonly cardRepo: CardRepository,
    private readonly uploadDir: string
  ) {}

  updateCard(userId: number, input: UpdateCardBody): Card {
    const existing = this.cardRepo.findByUserId(userId);
    if (!existing) {
      throw new NotFoundError('Card record not found for user.', 'CARD_NOT_FOUND');
    }

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

    const updated = this.cardRepo.updateByUserId(userId, {
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
      updated_at: new Date().toISOString(),
    });

    if (!updated) {
      throw new NotFoundError('Failed to update card record.', 'CARD_NOT_FOUND');
    }
    return updated;
  }

  async updateAvatar(userId: number, avatarFile: Express.Multer.File): Promise<Card> {
    const existing = this.cardRepo.findByUserId(userId);
    if (!existing) {
      throw new NotFoundError('Card record not found for user.', 'CARD_NOT_FOUND');
    }

    const newAvatarUrl = await processAndSaveAvatar(avatarFile, this.uploadDir);

    try {
      const updated = this.cardRepo.updateByUserId(userId, {
        avatar_url: newAvatarUrl,
        updated_at: new Date().toISOString(),
      });

      if (!updated) {
        await deleteAvatarFile(newAvatarUrl, this.uploadDir);
        throw new NotFoundError('Card record not found.', 'CARD_NOT_FOUND');
      }

      if (existing.avatar_url && existing.avatar_url !== newAvatarUrl) {
        await deleteAvatarFile(existing.avatar_url, this.uploadDir);
      }

      return updated;
    } catch (err) {
      await deleteAvatarFile(newAvatarUrl, this.uploadDir);
      throw err;
    }
  }

  async removeAvatar(userId: number): Promise<Card> {
    const existing = this.cardRepo.findByUserId(userId);
    if (!existing) {
      throw new NotFoundError('Card record not found for user.', 'CARD_NOT_FOUND');
    }

    const oldUrl = existing.avatar_url;
    const updated = this.cardRepo.updateByUserId(userId, {
      avatar_url: '',
      updated_at: new Date().toISOString(),
    });

    if (oldUrl) {
      await deleteAvatarFile(oldUrl, this.uploadDir);
    }

    return updated!;
  }
}
