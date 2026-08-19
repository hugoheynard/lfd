import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { UserProfile } from "../domain/entities/user-profile.js";
import {
  UserProfileRepository,
  type UserProfileRecord,
} from "../domain/ports/user-profile.repository.js";

/**
 * Adaptateur Prisma du port de profil. C'est ici — et nulle part en amont — que
 * les lignes de `users` deviennent des données de domaine.
 */
@Injectable()
export class PrismaUserProfileRepository extends UserProfileRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(userId: string): Promise<UserProfileRecord | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });
    if (row === null) {
      return null;
    }
    return {
      userId: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
    };
  }

  async findIdByEmail(email: string): Promise<string | null> {
    // `users.email` n'a pas de contrainte d'unicité (la clé est `auth0_sub`) :
    // c'est donc bien une recherche, pas un `findUnique`.
    const row = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async save(userId: string, profile: UserProfile): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: profile.firstName.value,
        lastName: profile.lastName.value,
        email: profile.email.value,
        phone: profile.phone.value,
      },
    });
  }
}
