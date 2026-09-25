import {
  dedupeStaffOverrides,
  isSuperAdminRoleKey,
  type StaffMeView,
  type StaffStatusChange,
  type StaffUserPayload,
  type StaffUserView,
} from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { bootstrapAdmin } from "../domain/bootstrap-admin.js";
import { isRescueFiche, resolveHeldRole } from "../../permissions/infrastructure/held-role.js";
import {
  assignableRole,
  roleColumns,
  type AssignableRole,
} from "../../permissions/infrastructure/role-assignment.js";
import {
  assertEditAllowed,
  assertStatusChangeAllowed,
} from "../../permissions/staff-access.policy.js";
import { parseStaffNavPreferences } from "../domain/staff-nav-preferences.js";
import { diffOverrides, isEmptyOverrideDiff, type OverrideDiff } from "../domain/override-diff.js";
import { DuplicateStaffEmailError, StaffUserNotFoundError } from "../domain/staff-user-errors.js";
import { StaffUserRepository, type StaffIdentityFacts } from "../domain/staff-user.repository.js";
import type {
  StaffUserCreated,
  StaffUserEdit,
  StaffUserIdentity,
  StaffUserSnapshot,
} from "../domain/staff-user-state.js";
import { loadMutationTarget } from "./staff-mutation-target.js";
import { linkedSubject } from "./staff-subject-aliases.js";
import {
  identityColumns,
  sameIdentity,
  SELECT,
  toView,
  type LoadedTarget,
  type OverrideRow,
} from "./staff-user.rows.js";

/** Adaptateur Prisma de l'annuaire staff. Tient l'unicité de l'e-mail. */
@Injectable()
export class PrismaStaffUserRepository extends StaffUserRepository {
  private readonly logger = new Logger(PrismaStaffUserRepository.name);

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
    const rescue = this.config.bootstrapAdminEmail();
    return rows.map((row) => toView(row, now, rescue, this.reportUnreadable));
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
    // La MÊME résolution que le guard, secours compris : `/admin/me` répond à
    // « que puis-je faire », et une autre réponse que celle du guard mentirait.
    const role = resolveHeldRole(
      row,
      row.overrides,
      isRescueFiche(row.email, this.config.bootstrapAdminEmail()),
      this.reportUnreadable,
    );
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      role: role.key,
      roleLabel: role.label,
      permissions: role.permissions,
      // Défauts appliqués ici, une fois : `nav_prefs` est `NULL` sur toutes les
      // fiches d'avant la colonne, et laisser passer ce `null` obligerait chaque
      // écran à décider pour son compte de ce que « rien de choisi » veut dire.
      navPrefs: parseStaffNavPreferences(row.navPrefs),
    };
  }

  async create(payload: StaffUserPayload, actorId: string): Promise<StaffUserCreated> {
    const data = identityColumns(payload);
    const overrides = dedupeStaffOverrides(payload.overrides);
    // Sous verrou partagé, dans l'unité de travail du handler : un archivage
    // concurrent attend que la fiche soit écrite (§3.3).
    const role = await assignableRole(this.prisma, data.role);
    await this.assertEmailFree(data.email, null);
    const granted = { grantedByStaffId: actorId, grantedAt: this.clock.now() };
    const created = await this.prisma.staffUser.create({
      data: {
        ...writableIdentity(data),
        overrides: { create: overrides.map((override) => ({ ...override, ...granted })) },
      },
      select: { id: true },
    });
    return { id: created.id, roleLabel: role.label };
  }

  async update(id: string, payload: StaffUserPayload, actorId: string): Promise<StaffUserEdit> {
    const target = await this.loadTarget(id, actorId);
    const requested = identityColumns(payload);
    // Normalisé AVANT de valider : on refuse ou on accepte exactement l'état
    // qu'on s'apprête à écrire, jamais un autre.
    const overrides = dedupeStaffOverrides(payload.overrides);
    const role = await this.intendedRole(target, requested.role);
    const after = { ...requested, role: role.key };
    assertEditAllowed(target.policy, {
      email: after.email,
      roleKey: role.key,
      roleGrants: role.grants,
      overrides,
    });
    await this.assertEmailFree(after.email, id);
    // Le formulaire décrit un ÉTAT ; on n'écrit que le CHANGEMENT. Recréer
    // toutes les lignes réattribuait chaque écart à son dernier éditeur et en
    // effaçait la date (plan `plan-journal-de-l-annuaire.md` §3).
    const diff = diffOverrides(target.overrides, overrides);
    await this.prisma.$transaction([
      ...this.overrideWrites(id, diff, actorId),
      ...(sameIdentity(target.snapshot, after)
        ? []
        : [this.prisma.staffUser.update({ where: { id }, data: writableIdentity(after) })]),
    ]);
    return {
      before: target.snapshot,
      after,
      overrides: diff,
      roleLabels: { before: target.roleLabel, after: role.label },
    };
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
    // l'écrase dans `auth0_id` (`architecture-journalisation.md` §12, D5.1).
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
    await this.prisma.staffUser.create({ data: writableIdentity(data), select: { id: true } });
  }

  /** L'état d'avant et les faits de la politique — cf. {@link loadMutationTarget}. */
  private loadTarget(id: string, actorId: string): Promise<LoadedTarget> {
    return loadMutationTarget(this.prisma, {
      id,
      actorId,
      rescueEmail: this.config.bootstrapAdminEmail(),
      report: this.reportUnreadable,
    });
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

  /**
   * Le rôle qu'une édition écrira. La fiche de secours se présente sous son rôle
   * EFFECTIF (`superadmin`, cf. `toView`) : le renvoyer tel quel veut dire
   * « inchangé », et la clé écrite est gardée — sans relire sa définition, qui
   * peut être archivée sans rien lui retirer (§3.4). Toute autre clé passe par
   * la politique, qui refuse de changer le rôle de cette fiche.
   */
  private async intendedRole(target: LoadedTarget, key: string): Promise<AssignableRole> {
    if (target.policy.isRoot && isSuperAdminRoleKey(key)) {
      return { key: target.policy.roleKey ?? "", label: target.roleLabel, grants: {} };
    }
    return assignableRole(this.prisma, key);
  }

  /** Une définition illisible : l'erreur au log, avec la clé (§2). */
  private readonly reportUnreadable = (roleKey: string, error: unknown): void => {
    this.logger.error(`Droits illisibles pour le rôle « ${roleKey} ».`, error);
  };

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

/** L'identité telle qu'elle s'écrit : la clé de rôle, et l'enum de transition. */
function writableIdentity(identity: StaffUserIdentity) {
  const { role, ...rest } = identity;
  return { ...rest, ...roleColumns(role) };
}
