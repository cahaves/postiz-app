import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export interface AiWritingProfile {
  language: 'auto' | 'id' | 'en';
  tone: 'friendly' | 'professional' | 'casual';
  brandName: string;
  audience: string;
  brandFacts: string;
  voiceNotes: string;
  examples: string[];
}

export interface AiWritingProfileResponse {
  profile: AiWritingProfile;
  revision: number;
}

export const defaultAiWritingProfile = (): AiWritingProfile => ({
  language: 'auto',
  tone: 'friendly',
  brandName: '',
  audience: '',
  brandFacts: '',
  voiceNotes: '',
  examples: [],
});

export class AiWritingProfileDto implements AiWritingProfile {
  @IsIn(['auto', 'id', 'en'])
  language: AiWritingProfile['language'];

  @IsIn(['friendly', 'professional', 'casual'])
  tone: AiWritingProfile['tone'];

  @IsString()
  @MaxLength(100)
  brandName: string;

  @IsString()
  @MaxLength(1000)
  audience: string;

  @IsString()
  @MaxLength(3000)
  brandFacts: string;

  @IsString()
  @MaxLength(2000)
  voiceNotes: string;

  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(1200, { each: true })
  examples: string[];
}

export class AiWritingProfileSaveDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => AiWritingProfileDto)
  profile: AiWritingProfileDto;

  @IsInt()
  @Min(0)
  @Max(2147483646)
  revision: number;
}
