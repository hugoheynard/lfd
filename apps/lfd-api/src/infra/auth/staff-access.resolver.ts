import { resolveStaffPermissions, type StaffOverride } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { Clock } from "../time/clock.js";
import type { StaffAccess, StaffPrincipal } from "./staff-principal.js";

/** Durée de vie d'une entrée de cache, en millisecondes. */
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  readonly access: StaffAccess;
  readonly expiresAt: number;
}

const STAFF_SELECT = {
  id: true,
  role: true,
  status: true,
  auth0Id: true,
  overrides: { select: { resource: true, action: true, effect: true } },
} as const;

/**
 * Relie l'identité **externe** prouvée par Auth0 (le `sub`) à une fiche de
 * l'annuaire staff, et en tire l'**effectif** de permissions.
 *
 * Trois décisions se rejoignent ici :
 *
 * - **Le jeton porte l'identité, jamais les droits.** Un jeton vit une heure ;
 *   un accès retiré doit prendre effet tout de suite. On relit donc l'annuaire à
 *   chaque requête, amorti par un cache de {@link CACHE_TTL_MS} — assez court
 *   pour qu'une révocation soit ressentie comme immédiate, assez long pour que
 *   l'annuaire ne devienne pas le goulot de chaque clic.
 * - **L'entrée se constate.** Au premier appel authentifié, on rapproche par
 *   e-mail et on **lie `auth0Id`** ; ensuite c'est le `sub` qui relie, et il ne
 *   bouge plus même si l'adresse change. Une fiche `pending`/`invited` devient
 *   `active` à cette occasion : présenter un jeton prouve qu'on est entré.
 * - **Fail-closed.** Un `sub` inconnu de l'annuaire n'obtient **rien**. Porter un
 *   jeton valide prouve qu'on est authentifié, pas qu'on est de l'équipe — et
 *   c'est exactement l'inverse de ce que faisait la surface admin jusqu'ici.
 *
 * Le contraste avec `CustomerPrincipalResolver` est délibéré : côté client, un `sub`
 * inconnu est provisionné (zéro friction) ; côté staff, il est refusé. On ne
 * rejoint pas l'équipe en se connectant.
 */
@Injectable()
export class StaffAccessResolver {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** @returns l'effectif de cette personne, ou `null` si l'annuaire l'ignore. */
  async resolve(principal: StaffPrincipal): Promise<StaffAccess | null> {
    const cached = this.cached(principal.subject);
    if (cached !== null) {
      return cached;
    }
    const row = await this.findStaff(principal);
    if (row === null || row.status === "suspended") {
      return null;
    }
    await this.recordEntry(row, principal.subject);

    const overrides: StaffOverride[] = row.overrides.map((entry) => ({ ...entry }));
    const access: StaffAccess = {
      staffUserId: row.id,
      role: row.role,
      permissions: resolveStaffPermissions(row.role, overrides),
    };
    this.cache.set(principal.subject, {
      access,
      expiresAt: this.clock.now().getTime() + CACHE_TTL_MS,
    });
    return access;
  }

  /**
   * Oublie ce qu'on savait — appelé par l'annuaire **au moment exact** où il
   * change, plutôt qu'en attendant l'expiration. C'est ce qui fait qu'une
   * suspension mord tout de suite au lieu de mordre dans trente secondes.
   */
  forgetAll(): void {
    this.cache.clear();
  }

  private cached(subject: string): StaffAccess | null {
    const entry = this.cache.get(subject);
    if (entry === undefined) {
      return null;
    }
    if (entry.expiresAt <= this.clock.now().getTime()) {
      this.cache.delete(subject);
      return null;
    }
    return entry.access;
  }

  /** Par `sub` d'abord (le lien durable), par e-mail ensuite (le premier contact). */
  private async findStaff(principal: StaffPrincipal) {
    const bySub = await this.prisma.staffUser.findUnique({
      where: { auth0Id: principal.subject },
      select: STAFF_SELECT,
    });
    if (bySub !== null || principal.email === undefined) {
      return bySub;
    }
    // Trimée autant que minusculée : une clé e-mail se normalise en entier, et
    // un espace parasite dans un claim rendrait la personne introuvable.
    return this.prisma.staffUser.findUnique({
      where: { email: principal.email.trim().toLowerCase() },
      select: STAFF_SELECT,
    });
  }

  /**
   * Écrit ce que **cette connexion** vient de prouver : la fiche est liée à son
   * identité, et la personne est entrée. N'écrit que si quelque chose change —
   * une écriture par requête serait un coût permanent pour un fait qui ne bouge
   * qu'une fois.
   */
  private async recordEntry(
    row: { id: string; status: string; auth0Id: string | null },
    subject: string,
  ): Promise<void> {
    const linkChanged = row.auth0Id !== subject;
    const entered = row.status !== "active";
    if (!linkChanged && !entered) {
      return;
    }
    await this.prisma.staffUser.update({
      where: { id: row.id },
      data: { auth0Id: subject, status: "active" },
    });
  }
}
