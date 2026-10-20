import { HttpException, Injectable, ValidationPipe } from '@nestjs/common';
import {
  AiWritingProfile,
  AiWritingProfileDto,
  AiWritingProfileResponse,
  AiWritingProfileSaveDto,
  defaultAiWritingProfile,
} from '@gitroom/nestjs-libraries/dtos/posts/ai.writing.profile.dto';
import { AiWritingProfileRepository } from './ai.writing.profile.repository';

export const aiWritingProfileError = (
  status: number,
  code: string,
  message: string
) => new HttpException({ code, message }, status);

const invalidProfile = () =>
  aiWritingProfileError(
    400,
    'AI_PROFILE_INVALID_INPUT',
    'Check your writing preferences and their length limits.'
  );
const unavailableProfile = () =>
  aiWritingProfileError(
    503,
    'AI_PROFILE_UNAVAILABLE',
    'Writing preferences are temporarily unavailable. Please try again.'
  );

@Injectable()
export class AiWritingProfileService {
  private readonly validation = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: invalidProfile,
  });

  constructor(private _profiles: AiWritingProfileRepository) {}

  private profileData(profile: AiWritingProfile): AiWritingProfile {
    return {
      language: profile.language,
      tone: profile.tone,
      brandName: profile.brandName,
      audience: profile.audience,
      brandFacts: profile.brandFacts,
      voiceNotes: profile.voiceNotes,
      examples: [...profile.examples],
    };
  }

  async get(orgId: string): Promise<AiWritingProfileResponse> {
    try {
      const stored = await this._profiles.get(orgId);
      if (!stored) return { profile: defaultAiWritingProfile(), revision: 0 };
      if (
        !Number.isInteger(stored.revision) ||
        stored.revision < 1 ||
        stored.revision > 2147483647
      )
        throw unavailableProfile();
      const profile = await this.validation.transform(stored.profile, {
        type: 'body',
        metatype: AiWritingProfileDto,
      });
      return { profile: this.profileData(profile), revision: stored.revision };
    } catch {
      throw unavailableProfile();
    }
  }

  async save(
    orgId: string,
    input: AiWritingProfileSaveDto
  ): Promise<AiWritingProfileResponse> {
    const dto: AiWritingProfileSaveDto = await this.validation.transform(
      input,
      {
        type: 'body',
        metatype: AiWritingProfileSaveDto,
      }
    );
    let saved;
    try {
      saved = await this._profiles.save(
        orgId,
        this.profileData(dto.profile),
        dto.revision
      );
    } catch {
      throw unavailableProfile();
    }
    if (!saved)
      throw aiWritingProfileError(
        409,
        'AI_PROFILE_CONFLICT',
        'Writing preferences changed. Reload them before saving again.'
      );
    return { profile: this.profileData(dto.profile), revision: saved.revision };
  }
}
