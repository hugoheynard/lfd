import type { StaffScope, StaffUserPayload, StaffUserView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { BOOTSTRAP_ADMIN, isBootstrapAdminEmail } from "../domain/bootstrap-admin.js";
import {
  DuplicateStaffEmailError,
  ProtectedStaffUserError,
  StaffUserNotFoundError,
} from "../domain/staff-user-errors.js";
import { StaffUserRepository } from "../domain/staff-user.repository.js";

interface StaffRow {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly scopes: readonly StaffScope[];
}

const SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  scopes: true,
} as const;

function toView(row: StaffRow): StaffUserView {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    scopes: row.scopes,
  };
}

/** E-mail normalisé (clé d'unicité) : trimé (zod) + minuscule. */
function normalizeEmail(email: string): string {
  return email.toLowerCase();
}

/** Périmètre dédoublonné (un ensemble, pas une liste). */
function dedupeScopes(scopes: readonly StaffScope[]): StaffScope[] {
  return [...new Set(scopes)];
}

/** Colonnes persistées d'une charge (identité + périmètre normalisés). */
function toData(payload: StaffUserPayload): {
  firstName: string;
  lastName: string;
  email: string;
  scopes: StaffScope[];
} {
  return {
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: normalizeEmail(payload.email),
    scopes: dedupeScopes(payload.scopes),
  };
}

/** Adaptateur Prisma de l'annuaire staff. Tient l'unicité de l'e-mail. */
@Injectable()
export class PrismaStaffUserRepository extends StaffUserRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly StaffUserView[]> {
    const rows = await this.prisma.staffUser.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: SELECT,
    });
    return rows.map(toView);
  }

  async create(payload: StaffUserPayload): Promise<string> {
    const data = toData(payload);
    await this.assertEmailFree(data.email, null);
    const created = await this.prisma.staffUser.create({ data, select: { id: true } });
    return created.id;
  }

  async update(id: string, payload: StaffUserPayload): Promise<void> {
    const existing = await this.prisma.staffUser.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    if (existing === null) {
      throw new StaffUserNotFoundError(id);
    }
    const data = toData(payload);
    // L'admin racine reste racine : e-mail figé + scope admin conservé (sinon il
    // s'auto-exclut du provisioning ou échappe à la garde par renommage).
    if (
      isBootstrapAdminEmail(existing.email) &&
      (!isBootstrapAdminEmail(data.email) || !data.scopes.includes("admin"))
    ) {
      throw new ProtectedStaffUserError();
    }
    await this.assertEmailFree(data.email, id);
    await this.prisma.staffUser.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.staffUser.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    if (existing === null) {
      throw new StaffUserNotFoundError(id);
    }
    if (isBootstrapAdminEmail(existing.email)) {
      throw new ProtectedStaffUserError();
    }
    await this.prisma.staffUser.delete({ where: { id } });
  }

  async ensureBootstrapAdmin(): Promise<void> {
    const data = toData(BOOTSTRAP_ADMIN);
    const existing = await this.prisma.staffUser.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (existing !== null) {
      return; // déjà présent — on ne clobbe pas d'éventuelles éditions (prénom…).
    }
    await this.prisma.staffUser.create({ data, select: { id: true } });
  }

  /** Refuse un e-mail déjà pris par un **autre** user (`exceptId` s'exclut lui-même). */
  private async assertEmailFree(email: string, exceptId: string | null): Promise<void> {
    const owner = await this.prisma.staffUser.findUnique({ where: { email }, select: { id: true } });
    if (owner !== null && owner.id !== exceptId) {
      throw new DuplicateStaffEmailError(email);
    }
  }
}
