import type { CardRepository } from '../repositories/cardRepository.js';
import type { Card } from '../db/schema.js';
import type { UpdateCardBody } from '../validators/card.js';
import {
  buildSocialsJson,
  parsePhoneEntries,
  serializePhoneEntries,
} from '../lib/sanitize.js';
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

    // Keep primary phone & multi-phone JSON synchronized cleanly whether edited from full UI or simple API callers
    let resolvedPhonesJson: string;
    let resolvedPrimaryPhone = input.phone;
    let resolvedWhatsapp = input.whatsapp;

    if (typeof input.phones_json === 'string') {
      const parsedPhones = parsePhoneEntries(input.phones_json);
      resolvedPhonesJson = serializePhoneEntries(parsedPhones);
      if (parsedPhones.length > 0) {
        if (!resolvedPrimaryPhone) {
          resolvedPrimaryPhone = parsedPhones[0].number;
        }
        if (!resolvedWhatsapp) {
          const waEntry = parsedPhones.find((p) => p.is_whatsapp);
          if (waEntry) resolvedWhatsapp = waEntry.number;
        }
      }
    } else {
      const syncedPhones = parsePhoneEntries('[]', input.phone, input.whatsapp);
      resolvedPhonesJson = serializePhoneEntries(syncedPhones);
    }

    const resolvedExtraSocialsJson =
      typeof input.extra_socials_json === 'string'
        ? input.extra_socials_json
        : existing.extra_socials_json;

    const updated = this.cardRepo.updateByUserId(userId, {
      full_name: input.full_name,
      job_title: input.job_title,
      company: input.company,
      tagline: input.tagline,
      address: input.address,
      maps_url: input.maps_url,
      phone: resolvedPrimaryPhone,
      whatsapp: resolvedWhatsapp,
      phones_json: resolvedPhonesJson,
      public_email: input.public_email,
      website: input.website,
      theme: input.theme,
      is_published: input.is_published,
      socials: socialsJson,
      extra_socials_json: resolvedExtraSocialsJson,
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
