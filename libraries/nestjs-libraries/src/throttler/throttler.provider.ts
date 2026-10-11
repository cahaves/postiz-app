import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import {
  aiTextError,
  aiTextUnavailable,
  aiTextStorageOperation,
} from '@gitroom/nestjs-libraries/openai/ai.text.service';

const isPublicComment = (method: string, url: string) =>
  method === 'POST' && /^\/public\/posts\/[^/]+\/comments/.test(url);

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  public override async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    const { url, method } = context.switchToHttp().getRequest<Request>();
    if (
      (method === 'POST' && url.includes('/public/v1/posts')) ||
      isPublicComment(method, url)
    ) {
      return super.canActivate(context);
    }

    return true;
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    if (!req.org) {
      const forwarded = String(req.headers?.['x-forwarded-for'] || '')
        .split(',')[0]
        .trim();
      return 'ip_' + (forwarded || req.ip || 'unknown');
    }

    return (
      req.org.id + '_' + (req.url.indexOf('/posts') > -1 ? 'posts' : 'other')
    );
  }
}

// route-level guard for public endpoints, keyed by the client address the
// proxy forwards rather than the org the global guard expects
@Injectable()
export class ThrottlerRealIpGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '');
    return forwarded.split(',')[0].trim() || req.ip;
  }
}

@Injectable()
export class AiTextThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ org?: { id?: string } }>();
    if (!req.org?.id)
      throw aiTextError(
        403,
        'AI_ACCESS_DENIED',
        'AI writing is not available for this organization.'
      );
    if (!process.env.OPENROUTER_API_KEY?.trim())
      throw aiTextError(
        503,
        'AI_NOT_CONFIGURED',
        'AI writing is not configured. Ask your administrator to configure OpenRouter.'
      );
    if (ioRedis.status !== 'ready' || typeof ioRedis.eval !== 'function')
      throw aiTextUnavailable();
    try {
      return await aiTextStorageOperation(super.canActivate(context));
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        throw aiTextError(
          429,
          'AI_RATE_LIMITED',
          'AI writing is rate limited. Please try again shortly.'
        );
      }
      throw aiTextUnavailable();
    }
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    return `ai-text:${req.org.id}`;
  }
}
