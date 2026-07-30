import { Module } from '@nestjs/common';

/**
 * Bounded context: users, roles/RBAC, auth (WhatsApp OTP + Google Sign-In),
 * tutor/student profiles. Verification and consent live in TrustModule.
 * Owns tables: users, user_roles, profiles_tutor, profiles_student.
 */
@Module({})
export class IdentityModule {}
