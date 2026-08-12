import {
  dedupeStaffOverrides,
  resolveStaffPermissions,
  type StaffMeView,
  type StaffStatusChange,
  type StaffOverride,
  type StaffRole,
  type StaffStatus,
  type StaffUserPayload,
  type StaffUserView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../infra/config/app-config.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import { bootstrapAdmin } from "../domain/bootstrap-admin.js";
import {
  assertEditAllowed,
  assertRemovalAllowed,
  assertStatusChangeAllowed,
  type StaffMutationTarget,
} from "../domain/staff-access.policy.js";
import { DuplicateStaffEmailError, StaffUserNotFoundError } from "../domain/staff-user-errors.js";
import { StaffUserRepository } from "../domain/staff-user.repository.js";

interface OverrideRow {
  readonly resource: StaffOverride["resource"];
  readonly action: StaffOverride["action"];
  readonly effect: StaffOverride["effect"];
}

interface StaffRow {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly jobTitle: string;
  readonly role: StaffRole;
  readonly status: StaffStatus;
  readonly overrides: readonly OverrideRow[];
}

const SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  jobTitle: true,
  role: true,
  status: true,
  overrides: { select: { resource: true, action: true, effect: true } },
} as const;

/**
 * La vue porte l'**effectif** déjà résolu : l'écran affiche ce qu'on lui donne au
 * lieu de rejouer la formule. Deux implémentations de la même règle divergent.
 */
function toView(row: StaffRow): StaffUserView {
  const overrides = row.overrides.map((entry) => ({ ...entry }));
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    jobTitle: row.jobTitle,
    role: row.role,
    status: row.status,
    overrides,
    permissions: resolveStaffPermissions(row.role, overrides),
  };
}

/** E-mail normalisé (clé d'unicité) : trimé (zod) + minuscule. */
function normalizeEmail(email: string): string {
  return email.toLowerCase();
}

/** Colonnes d'identité d'une charge. Les dérogations vivent dans leur table. */
function identityColumns(payload: StaffUserPayload) {
  return {
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: normalizeEmail(payload.email),
    phone: payload.phone,
    jobTitle: payload.jobTitle,
    role: payload.role,
  };
}

/** Adaptateur Prisma de l'annuaire staff. Tient l'unicité de l'e-mail. */
@Injectable()
export class PrismaStaffUserRepository extends StaffUserRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async list(): Promise<readonly StaffUserView[]> {
    const rows = await this.prisma.staffUser.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: SELECT,
    });
    return rows.map(toView);
  }

  async me(id: string): Promise<StaffMeView> {
    const row = await this.prisma.staffUser.findUnique({ where: { id }, select: SELECT });
    if (row === null) {
      throw new StaffUserNotFoundError(id);
    }
    const view = toView(row);
    return {
      id: view.id,
      firstName: view.firstName,
      lastName: view.lastName,
      email: view.email,
      role: view.role,
      permissions: view.permissions,
    };
  }

  async create(payload: StaffUserPayload, actorSub: string): Promise<string> {
    const data = identityColumns(payload);
    const overrides = dedupeStaffOverrides(payload.overrides);
    await this.assertEmailFree(data.email, null);
    const created = await this.prisma.staffUser.create({
      data: { ...data, overrides: { create: overrideRows(overrides, actorSub) } },
      select: { id: true },
    });
    return created.id;
  }

  async update(id: string, payload: StaffUserPayload, actorSub: string): Promise<void> {
    const target = await this.loadTarget(id, actorSub);
    const data = identityColumns(payload);
    // Normalisé AVANT de valider : on refuse ou on accepte exactement l'état
    // qu'on s'apprête à écrire, jamais un autre.
    const overrides = dedupeStaffOverrides(payload.overrides);
    assertEditAllowed(target, { email: data.email, role: data.role, overrides });
    await this.assertEmailFree(data.email, id);
    // Les dérogations se remplacent en bloc : le formulaire décrit un état, pas
    // une suite d'ajouts, et un delta partiel laisserait des lignes fantômes.
    await this.prisma.$transaction([
      this.prisma.staffPermissionOverride.deleteMany({ where: { staffUserId: id } }),
      this.prisma.staffUser.update({
        where: { id },
        data: { ...data, overrides: { create: overrideRows(overrides, actorSub) } },
      }),
    ]);
  }

  async remove(id: string, actorSub: string): Promise<void> {
    const target = await this.loadTarget(id, actorSub);
    assertRemovalAllowed(target);
    await this.prisma.staffUser.delete({ where: { id } });
  }

  async setStatus(id: string, change: StaffStatusChange, actorSub: string): Promise<void> {
    const target = await this.loadTarget(id, actorSub);
    assertStatusChangeAllowed(target, change.status);
    await this.prisma.staffUser.update({ where: { id }, data: { status: change.status } });
  }

  async ensureBootstrapAdmin(): Promise<void> {
    const data = identityColumns(bootstrapAdmin(this.config.bootstrapAdminEmail()));
    const existing = await this.prisma.staffUser.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (existing !== null) {
      return; // déjà présent — on ne clobbe pas d'éventuelles éditions (prénom…).
    }
    await this.prisma.staffUser.create({ data, select: { id: true } });
  }

  /**
   * Rassemble les faits dont la politique a besoin. `isSelf` se déduit de la
   * liaison Auth0 : tant qu'elle est nulle (personne n'est jamais entré), le
   * garde-fou est inerte — jamais faux.
   */
  private async loadTarget(id: string, actorSub: string): Promise<StaffMutationTarget> {
    const existing = await this.prisma.staffUser.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, auth0Id: true },
    });
    if (existing === null) {
      throw new StaffUserNotFoundError(id);
    }
    return {
      email: existing.email,
      isRoot: existing.email === this.config.bootstrapAdminEmail(),
      role: existing.role,
      otherLivingAdmins: await this.countOtherLivingAdmins(id),
      isSelf: existing.auth0Id !== null && existing.auth0Id === actorSub,
    };
  }

  /** Les administrateurs encore en état d'entrer, la cible exclue. */
  private countOtherLivingAdmins(exceptId: string): Promise<number> {
    return this.prisma.staffUser.count({
      where: { role: "admin", status: { not: "suspended" }, id: { not: exceptId } },
    });
  }

  /** Refuse un e-mail déjà pris par un **autre** user (`exceptId` s'exclut lui-même). */
  private async assertEmailFree(email: string, exceptId: string | null): Promise<void> {
    const owner = await this.prisma.staffUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (owner !== null && owner.id !== exceptId) {
      throw new DuplicateStaffEmailError(email);
    }
  }
}

/** Lignes de dérogation, attribuées à leur auteur. Déjà dédoublonnées en amont. */
function overrideRows(overrides: readonly StaffOverride[], grantedBy: string) {
  return overrides.map((override) => ({ ...override, grantedBy }));
}
