import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

export interface AiTextCapabilities {
  configured: boolean;
  reason?: 'missing-provider-key';
}
export interface AiTextBlock {
  id: string;
  content: string;
}
export interface AiTextChannel {
  integrationId: string;
  settings: Record<string, unknown>;
}
export interface AiTextHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface AiTextResponse {
  blocks: AiTextBlock[];
  limits: {
    integrationId: string;
    maximumCharacters: number | null;
    counts: { id: string; count: number }[];
  }[];
}

class AiTextBlockDto implements AiTextBlock {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id: string;
  @IsString()
  @MaxLength(12000)
  content: string;
}
class AiTextChannelDto implements AiTextChannel {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  integrationId: string;
  @IsObject()
  settings: Record<string, unknown>;
}
class AiTextHistoryDto implements AiTextHistoryMessage {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';
  @IsString()
  @MaxLength(2000)
  content: string;
}

@ValidatorConstraint({ name: 'aiTextBounds', async: false })
class AiTextBounds implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as AiTextRequestDto;
    if (
      !Array.isArray(dto.blocks) ||
      !Array.isArray(dto.channels) ||
      !Array.isArray(dto.history)
    )
      return false;
    if (
      new Set(dto.blocks.map((block) => block?.id)).size !==
        dto.blocks.length ||
      new Set(dto.channels.map((channel) => channel?.integrationId)).size !==
        dto.channels.length
    )
      return false;
    const texts = [
      value,
      ...dto.blocks.map((block) => block?.content),
      ...dto.history.map((message) => message?.content),
    ];
    if (
      texts.some((text) => typeof text !== 'string') ||
      texts.reduce<number>(
        (sum, text) => sum + (typeof text === 'string' ? text.length : 0),
        0
      ) > 24000
    )
      return false;
    if (typeof value !== 'string' || !value.trim() || value.length > 2000)
      return false;
    if (
      dto.blocks.some(
        (block) =>
          typeof block?.id !== 'string' ||
          !block.id.trim() ||
          block.id.length > 128 ||
          typeof block.content !== 'string' ||
          block.content.length > 12000
      ) ||
      dto.channels.some(
        (channel) =>
          typeof channel?.integrationId !== 'string' ||
          !channel.integrationId.trim() ||
          channel.integrationId.length > 128
      ) ||
      dto.history.some(
        (message) =>
          typeof message?.content !== 'string' || message.content.length > 2000
      )
    )
      return false;
    const safeSettings = (input: unknown, depth: number): boolean => {
      if (depth > 6) return false;
      if (input === null || typeof input !== 'object')
        return (
          ['string', 'number', 'boolean'].includes(typeof input) ||
          input === null
        );
      return Object.entries(input).every(
        ([key, child]) =>
          !['__proto__', 'prototype', 'constructor'].includes(key) &&
          safeSettings(child, depth + 1)
      );
    };
    try {
      return (
        dto.channels.every((channel) => safeSettings(channel?.settings, 0)) &&
        new TextEncoder().encode(
          JSON.stringify(dto.channels.map((channel) => channel.settings))
        ).length <= 8192
      );
    } catch {
      return false;
    }
  }
  defaultMessage(): string {
    return 'AI request exceeds its input bounds';
  }
}

export class AiTextRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Validate(AiTextBounds)
  instruction: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AiTextChannelDto)
  channels: AiTextChannelDto[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AiTextBlockDto)
  blocks: AiTextBlockDto[];
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => AiTextHistoryDto)
  history: AiTextHistoryDto[];
}
