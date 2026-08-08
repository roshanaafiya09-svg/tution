import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRepository } from './admin.repository';
import { UsersRepository } from '../identity/users/users.repository';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  TokensService,
} from '../identity/auth/tokens.service';
import type { UserRole } from '../../database/types';

const VIEWABLE_ROLES = ['tutor', 'student', 'parent'] as const;
type ViewableRole = (typeof VIEWABLE_ROLES)[number];

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly usersRepository: UsersRepository,
    private readonly tokensService: TokensService,
  ) {}

  async listTeachers(q?: string) {
    return this.adminRepository.listTeachers(q);
  }

  async listStudents(q?: string) {
    return this.adminRepository.listStudents(q);
  }

  async listParents(q?: string) {
    const parents = await this.adminRepository.listParents(q);
    if (parents.length === 0) return [];

    const counts = await this.adminRepository.countActiveLinkedChildren(
      parents.map((p) => p.id),
    );
    return parents.map((p) => ({
      ...p,
      linkedChildren: counts.get(p.id) ?? 0,
    }));
  }

  /** Mints a view-only, refresh-token-less access token scoped to the
   *  target's own identity so their existing dashboard(s) render exactly
   *  as they would if that person signed in themself — see
   *  JwtAuthGuard's `impersonation` check for the write-blocking side. */
  async impersonate(adminId: string, targetUserId: string) {
    if (targetUserId === adminId) {
      throw new ForbiddenException(
        'You are already signed in as yourself — nothing to view.',
      );
    }

    const target = await this.usersRepository.findById(targetUserId);
    if (!target) throw new NotFoundException('User not found');

    const roles = await this.usersRepository.getRoles(targetUserId);
    this.assertNotSuperAdmin(roles);

    const viewableRole = this.pickViewableRole(roles);

    const accessToken = this.tokensService.signImpersonationToken(
      targetUserId,
      roles,
      adminId,
    );
    const displayName = await this.adminRepository.findDisplayName(
      targetUserId,
      viewableRole,
    );

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      target: {
        id: target.id,
        role: viewableRole,
        displayName,
        email: target.email,
        phoneE164: target.phone_e164,
      },
    };
  }

  /**
   * Hard-deletes exactly the one account named by `targetUserId` — there
   * is no bulk/list variant of this method anywhere in AdminService, and
   * the only caller is AdminController.deleteUser, which only ever
   * receives a single id from the frontend's per-row, type-to-confirm
   * delete action. Both the self-check and the superadmin-role check
   * below are the enforced guarantee that the Super Admin account can
   * never be removed this way, regardless of what the frontend sends.
   */
  async deleteUser(adminId: string, targetUserId: string) {
    if (targetUserId === adminId) {
      throw new ForbiddenException(
        'The Super Admin account cannot be deleted.',
      );
    }

    const target = await this.usersRepository.findById(targetUserId);
    if (!target) throw new NotFoundException('User not found');

    const roles = await this.usersRepository.getRoles(targetUserId);
    this.assertNotSuperAdmin(roles);

    await this.tokensService.revokeAllSessions(targetUserId);
    await this.usersRepository.hardDelete(targetUserId);
  }

  private assertNotSuperAdmin(roles: UserRole[]): void {
    if (roles.includes('superadmin')) {
      throw new ForbiddenException('Super Admin accounts are protected.');
    }
  }

  private pickViewableRole(roles: UserRole[]): ViewableRole {
    const role = VIEWABLE_ROLES.find((r) => roles.includes(r));
    if (!role) {
      throw new ForbiddenException(
        'This account has no teacher, student, or parent dashboard to view.',
      );
    }
    return role;
  }
}
