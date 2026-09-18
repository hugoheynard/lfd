import {
  dedupeStaffOverrides,
  type StaffMeView,
  type StaffStatusChange,
  type StaffUserPayload,
  type StaffUserView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { bootstrapAdmin } from "../domain/bootstrap-admin.js";
import {
  assertEditAllowed,
  assertStatusChangeAllowed,
} from "../../permissions/staff-access.policy.js";
import { parseStaffNavPreferences } from "../domain/staff-nav-preferences.js";
import { diffOverrides, isEmptyOverrideDiff, type OverrideDiff } from "../domain/override-diff.js";
import { DuplicateStaffEmailError, StaffUserNotFoundError } from "../domain/staff-user-errors.js";
import { StaffUserRepository, type StaffIdentityFacts } from "../domain/staff-user.repository.js";
import type { StaffUserEdit, StaffUserSnapshot } from "../domain/staff-user-state.js";
import { linkedSubject } from "./staff-subject-aliases.js";
import {
  identityColumns,
  sameIdentity,
  SELECT,
  SNAPSHOT,
  toView,
  type LoadedTarget,
  type OverrideRow,
} from "./staff-user.rows.js";

/** Adaptateur Prisma de l'annuaire staff. Tient l'unicité de l'e-mail. */
@Injectable()
export class PrismaStaffUserRepository extends StaffUserRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {
    super();
  }

  async list(): Promise<readonly StaffUserView[]> {
    const rows = await this.prisma.staffUser.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: SELECT,
    });
    const now = this.clock.now();
    return rows.map((row) => toView(row, now));
  }

  async me(id: string): Promise<StaffMeView> {
    // Les préférences ne sont lues QUE par la surface réflexive : l'annuaire les
    // affiche nulle part, et un `select` partagé les enverrait à tout le monde.
    const row = await this.prisma.staffUser.findUnique({
      where: { id },
      select: { ...SELECT, navPrefs: true },
    });
    if (row === null) {
      throw new StaffUserNotFoundError(id);
    }
    const view = toView(row, this.clock.now());
    return {
      id: view.id,
      firstName: view.firstName,
      lastName: view.lastName,
      email: view.email,
      role: view.role,
      permissions: view.permissions,
      // Défauts appliqués ici, une fois : `nav_prefs` est `NULL` sur toutes les
      // fiches d'avant la colonne, et laisser passer ce `null` obligerait chaque
      // écran à décider pour son compte de ce que « rien de choisi » veut dire.
      navPrefs: parseStaffNavPreferences(row.navPrefs),
    };
  }

  async create(payload: StaffUserPayload, actorId: string): Promise<string> {
    const data = identityColumns(payload);
    const overrides = dedupeStaffOverrides(payload.overrides);
    await this.assertEmailFree(data.email, null);
    const granted = { grantedByStaffId: actorId, grantedAt: this.clock.now() };
    const created = await this.prisma.staffUser.create({
      data: {
        ...data,
        overrides: { create: overrides.map((override) => ({ ...override, ...granted })) },
      },
      select: { id: true },
    });
    return created.id;
  }

  async update(id: string, payload: StaffUserPayload, actorId: string): Promise<StaffUserEdit> {
    const target = await this.loadTarget(id, actorId);
    const after = identityColumns(payload);
    // Normalisé AVANT de valider : on refuse ou on accepte exactement l'état
    // qu'on s'apprête à écrire, jamais un autre.
    const overrides = dedupeStaffOverrides(payload.overrides);
    assertEditAllowed(target.policy, { email: after.email, role: after.role, overrides });
    await this.assertEmailFree(after.email, id);
    // Le formulaire décrit un ÉTAT ; on n'écrit que le CHANGEMENT. Recréer
    // toutes les lignes réattribuait chaque écart à son dernier éditeur et en
    // effaçait la date (plan `plan-journal-de-l-annuaire.md` §3).
    const diff = diffOverrides(target.overrides, overrides);
    await this.prisma.$transaction([
      ...this.overrideWrites(id, diff, actorId),
      ...(sameIdentity(target.snapshot, after)
        ? []
        : [this.prisma.staffUser.update({ where: { id }, data: after })]),
    ]);
    return { before: target.snapshot, after, overrides: diff };
  }

  async setStatus(
    id: string,
    change: StaffStatusChange,
    actorId: string,
  ): Promise<StaffUserSnapshot> {
    const target = await this.loadTarget(id, actorId);
    assertStatusChangeAllowed(target.policy, change.status);
    if (target.snapshot.status !== change.status) {
      await this.prisma.staffUser.update({ where: { id }, data: { status: change.status } });
    }
    return target.snapshot;
  }

  async identityOf(id: string): Promise<StaffIdentityFacts> {
    const row = await this.prisma.staffUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        auth0Id: true,
        status: true,
      },
    });
    if (row === null) {
      throw new StaffUserNotFoundError(id);
    }
    return row;
  }

  async markInvited(id: string, subject: string, invitedAt: Date): Promise<void> {
    const current = await this.prisma.staffUser.findUnique({
      where: { id },
      select: { status: true },
    });
    if (current === null) {
      throw new StaffUserNotFoundError(id);
    }
    // La liaison et sa trace dans la table des `sub` partent ensemble : un
    // `sub` relié à une fiche ne doit plus pouvoir se perdre quand un suivant
    // l'écrase dans `auth0_id` (plan `plan-l-auteur-est-la-fiche.md`, D5.1).
    await this.prisma.$transaction([
      this.prisma.staffUser.update({
        where: { id },
        data: {
          auth0Id: subject,
          invitedAt,
          // Renvoyer un lien à quelqu'un déjà entré ne le remet pas en attente :
          // il n'a rien perdu, il a juste oublié son mot de passe.
          ...(current.status === "active" ? {} : { status: "invited" as const }),
        },
      }),
      this.prisma.staffSubjectAlias.createMany(linkedSubject(subject, id)),
    ]);
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
   * Rassemble l'état complet d'avant — la fiche et ses dérogations — et les
   * faits dont la politique a besoin.
   *
   * `isSelf` compare les **id de fiche** : l'auteur arrive par son id
   * d'annuaire (`@StaffUserId()`), plus par son `sub`. Une fiche jamais liée
   * à une identité se reconnaît donc elle aussi — le garde-fou n'est plus
   * inerte tant que personne n'est entré.
   */
  private async loadTarget(id: string, actorId: string): Promise<LoadedTarget> {
    const existing = await this.prisma.staffUser.findUnique({
      where: { id },
      select: {
        ...SNAPSHOT,
        overrides: { select: { resource: true, action: true, effect: true } },
      },
    });
    if (existing === null) {
      throw new StaffUserNotFoundError(id);
    }
    const { overrides, ...snapshot } = existing;
    return {
      snapshot,
      overrides,
      policy: {
        email: existing.email,
        isRoot: existing.email === this.config.bootstrapAdminEmail(),
        role: existing.role,
        otherLivingAdmins: await this.countOtherLivingAdmins(id),
        isSelf: existing.id === actorId,
      },
    };
  }

  /**
   * Les écritures du diff, et elles seules. Les écarts inchangés gardent leur
   * auteur et leur date : c'est tout l'objet du lot 1.
   */
  private overrideWrites(id: string, diff: OverrideDiff, actorId: string) {
    if (isEmptyOverrideDiff(diff)) {
      return [];
    }
    const granted = { grantedByStaffId: actorId, grantedAt: this.clock.now() };
    const where = (entry: OverrideRow) => ({
      staffUserId_resource_action: {
        staffUserId: id,
        resource: entry.resource,
        action: entry.action,
      },
    });
    return [
      ...diff.removed.map((entry) =>
        this.prisma.staffPermissionOverride.delete({ where: where(entry) }),
      ),
      ...diff.changed.map((entry) =>
        this.prisma.staffPermissionOverride.update({
          where: where(entry),
          data: { effect: entry.effect, ...granted },
        }),
      ),
      ...diff.added.map((entry) =>
        this.prisma.staffPermissionOverride.create({
          data: { staffUserId: id, ...entry, ...granted },
        }),
      ),
    ];
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
