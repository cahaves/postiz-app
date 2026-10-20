import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpException,
  Post,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, UserOrganization } from '@prisma/client';
import { Response } from 'express';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { AiWritingProfileSaveDto } from '@gitroom/nestjs-libraries/dtos/posts/ai.writing.profile.dto';
import {
  AiWritingProfileService,
  aiWritingProfileError,
} from '@gitroom/nestjs-libraries/database/prisma/ai-writing-profile/ai.writing.profile.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@Catch(HttpException)
export class AiWritingProfileExceptionFilter implements ExceptionFilter {
  catch(error: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof SubscriptionException) {
      response.status(403).json({
        code: 'AI_ACCESS_DENIED',
        message: 'You do not have access to these writing preferences.',
      });
      return;
    }
    const body = error.getResponse();
    response.status(error.getStatus()).json(
      typeof body === 'object' && 'code' in body
        ? body
        : {
            code: 'AI_PROFILE_INVALID_INPUT',
            message: 'Check your writing preferences and their length limits.',
          }
    );
  }
}

@ApiTags('Posts')
@Controller('/posts/ai-text/profile')
@UseFilters(AiWritingProfileExceptionFilter)
export class AiWritingProfileController {
  constructor(private _profiles: AiWritingProfileService) {}

  @Get()
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  get(@GetOrgFromRequest() org: Organization) {
    return this._profiles.get(org.id);
  }

  @Post()
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.AI],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  )
  async save(
    @GetOrgFromRequest()
    org: Organization & { users?: Pick<UserOrganization, 'role'>[] },
    @Body() body: AiWritingProfileSaveDto
  ) {
    if (!['ADMIN', 'SUPERADMIN'].includes(org.users?.[0]?.role))
      throw aiWritingProfileError(
        403,
        'AI_PROFILE_ADMIN_REQUIRED',
        'Only an organization administrator can save writing preferences.'
      );
    return this._profiles.save(org.id, body);
  }
}
