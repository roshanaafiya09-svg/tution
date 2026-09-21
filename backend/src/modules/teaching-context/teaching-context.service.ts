import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AcademyMembershipsRepository } from '../marketplace/academy-memberships/academy-memberships.repository';
import {
  INDIVIDUAL_CONTEXT,
  parseTeachingContext,
  type TeachingContext,
} from './teaching-context';

@Injectable()
export class TeachingContextService {
  constructor(
    private readonly membershipsRepository: AcademyMembershipsRepository,
  ) {}

  /** Turns the raw request header into a verified context for this
   *  tutor. An Academy context is only honoured while the tutor is an
   *  ACTIVE member of that academy — never trusted from the client. */
  async resolve(
    tutorId: string,
    rawHeader: string | undefined,
  ): Promise<TeachingContext> {
    const ctx = parseTeachingContext(rawHeader);
    if (!ctx) {
      throw new BadRequestException('Invalid teaching context');
    }
    if (ctx.kind === 'academy') {
      await this.assertActiveMember(ctx.academyId, tutorId);
    }
    return ctx;
  }

  async assertActiveMember(academyId: string, tutorId: string): Promise<void> {
    const membership = await this.membershipsRepository.findActiveMembership(
      academyId,
      tutorId,
    );
    if (!membership) {
      throw new ForbiddenException(
        "You aren't an active member of that academy",
      );
    }
  }

  /** Contexts a tutor can currently switch between: Individual always,
   *  plus one per ACTIVE academy membership. A left membership is not
   *  offered — its history stays with the academy. */
  async listAvailable(tutorId: string) {
    const academies =
      await this.membershipsRepository.listActiveForTutor(tutorId);
    return {
      individual: INDIVIDUAL_CONTEXT,
      academies: academies.map((a) => ({
        academyId: a.id,
        name: a.name,
        slug: a.slug,
        logoObjectKey: a.logo_object_key,
      })),
    };
  }
}
