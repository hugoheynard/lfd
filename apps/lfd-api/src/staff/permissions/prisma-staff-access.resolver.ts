import { resolveStaffPermissions, type StaffOverride } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { Clock } from "../../platform/time/clock.js";
import { isOutsideDatabaseConnection } from "../../platform/auth/auth0-claims.js";
import { StaffAccessResolver } from "../../platform/auth/staff-access.resolver.js";
import type { StaffAccess, StaffPrincipal } from "../../platform/auth/staff-principal.js";
import { linkedSubject } from "../directory/infrastructure/staff-subject-aliases.js";

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
 * L'adaptateur de {@link StaffAccessResolver} — il vit dans l'annuaire, parce
 * que c'est l'annuaire qu'il lit.
 *
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
 * - **Le rapprochement par e-mail ne vole jamais une fiche** (2026-09-17). Il
 *   ne vaut que pour une fiche **jamais liée**, et que si le jeton atteste
 *   une adresse **vérifiée**. Avant, il réécrivait `auth0Id` sans condition :
 *   quiconque ouvrait un compte Auth0 sous l'adresse d'un membre — inscription
 *   sans confirmation — prenait ses droits et le mettait dehors.
 * - **Pas de connexion sociale** (Hugo, 2026-09-17). Un `sub` Google ou
 *   Facebook n'entre pas au back-office, même lié : le staff se connecte par
 *   e-mail et mot de passe, ceux que l'invitation a ouverts. Google est coupé
 *   sur l'application admin du tenant le même jour ; ceci tient si ce réglage
 *   se perd. ⚠️ Ce n'est PAS le mur client/staff : un `auth0|` client passe
 *   cette règle, et c'est l'audience du jeton qui le tient.
 *
 * La sortie d'une fiche liée à un `sub` mort ou refusé est la **réinvitation**
 * (`OpenStaffAccess`), qui rouvre une identité par l'adresse et relie la fiche.
 * - **Fail-closed.** Un `sub` inconnu de l'annuaire n'obtient **rien**. Porter un
 *   jeton valide prouve qu'on est authentifié, pas qu'on est de l'équipe — et
 *   c'est exactement l'inverse de ce que faisait la surface admin jusqu'ici.
 *
 * Le contraste avec `CustomerPrincipalResolver` est délibéré : côté client, un `sub`
 * inconnu est provisionné (zéro friction) ; côté staff, il est refusé. On ne
 * rejoint pas l'équipe en se connectant.
 */
@Injectable()
export class PrismaStaffAccessResolver extends StaffAccessResolver {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async resolve(principal: StaffPrincipal): Promise<StaffAccess | null> {
    if (isOutsideDatabaseConnection(principal.subject)) {
      return null;
    }
    const cached = this.cached(principal.subject);
    if (cached !== null) {
      return cached;
    }
    const row = await this.findStaff(principal);
    if (row === null || row.status === "suspended") {
      return null;
    }
    if (!(await this.recordEntry(row, principal.subject))) {
      return null;
    }

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

  /**
   * Par `sub` d'abord (le lien durable), par e-mail ensuite (le premier
   * contact) — et ce second chemin ne rend qu'une fiche **sans lien**, à qui
   * prouve son adresse.
   */
  private async findStaff(principal: StaffPrincipal) {
    const bySub = await this.prisma.staffUser.findUnique({
      where: { auth0Id: principal.subject },
      select: STAFF_SELECT,
    });
    if (bySub !== null || principal.email === undefined || principal.emailVerified !== true) {
      return bySub;
    }
    // Trimée autant que minusculée : une clé e-mail se normalise en entier, et
    // un espace parasite dans un claim rendrait la personne introuvable.
    const byEmail = await this.prisma.staffUser.findUnique({
      where: { email: principal.email.trim().toLowerCase() },
      select: STAFF_SELECT,
    });
    // Une fiche déjà liée appartient à son `sub`. Un autre `sub` sous la même
    // adresse est un autre compte Auth0 — pas la même personne, jusqu'à preuve
    // du contraire, et cette preuve se fait par une nouvelle invitation.
    // `recordEntry` le revérifie en base : ce test-ci ne tient pas une course.
    return byEmail?.auth0Id === null ? byEmail : null;
  }

  /**
   * Écrit ce que **cette connexion** vient de prouver : la fiche est liée à son
   * identité, et la personne est entrée. N'écrit que si quelque chose change —
   * une écriture par requête serait un coût permanent pour un fait qui ne bouge
   * qu'une fois.
   *
   * La liaison est **conditionnée en base** à une fiche encore sans lien : deux
   * premières connexions simultanées ne se la disputent pas, la seconde est
   * refusée. Rend `false` quand elle a perdu.
   */
  private async recordEntry(
    row: { id: string; status: string; auth0Id: string | null },
    subject: string,
  ): Promise<boolean> {
    if (row.auth0Id === null) {
      return this.link(row.id, subject);
    }
    if (row.status !== "active") {
      await this.prisma.staffUser.update({
        where: { id: row.id },
        data: { status: "active" },
      });
    }
    return true;
  }

  /**
   * Relie la fiche à ce `sub` et l'inscrit dans la table des `sub`, dans la
   * même transaction (`architecture-journalisation.md` §12, D5.1).
   *
   * L'inscription n'a lieu que si la liaison a GAGNÉ : un `sub` qui a perdu la
   * course n'est pas celui de cette fiche, et l'inscrire lui attribuerait des
   * actes qu'elle n'a pas faits.
   */
  private async link(staffUserId: string, subject: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const linked = await tx.staffUser.updateMany({
        where: { id: staffUserId, auth0Id: null },
        data: { auth0Id: subject, status: "active" },
      });
      if (linked.count !== 1) {
        return false;
      }
      await tx.staffSubjectAlias.createMany(linkedSubject(subject, staffUserId));
      return true;
    });
  }
}
