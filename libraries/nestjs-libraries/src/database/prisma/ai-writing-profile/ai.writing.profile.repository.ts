import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { AiWritingProfile } from '@gitroom/nestjs-libraries/dtos/posts/ai.writing.profile.dto';

@Injectable()
export class AiWritingProfileRepository {
  constructor(private _profiles: PrismaRepository<'aiWritingProfile'>) {}

  get(orgId: string) {
    return this._profiles.model.aiWritingProfile.findUnique({
      where: { organizationId: orgId },
      select: { profile: true, revision: true },
    });
  }

  async save(orgId: string, profile: AiWritingProfile, revision: number) {
    try {
      const data = { ...profile, examples: [...profile.examples] };
      if (revision === 0) {
        return await this._profiles.model.aiWritingProfile.create({
          data: { organizationId: orgId, profile: data, revision: 1 },
          select: { profile: true, revision: true },
        });
      }
      return await this._profiles.model.aiWritingProfile.update({
        where: { organizationId: orgId, revision },
        data: { profile: data, revision: { increment: 1 } },
        select: { profile: true, revision: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2025')
      ) {
        return null;
      }
      throw error;
    }
  }
}
