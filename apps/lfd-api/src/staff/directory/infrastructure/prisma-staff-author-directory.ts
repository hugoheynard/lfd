import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  HELD_ROLE_SELECT,
  heldRoleKey,
  heldRoleLabel,
  type HeldRoleRow,
} from "../../permissions/infrastructure/held-role.js";
import {
  StaffAuthorDirectory,
  StaffAuthorReferences,
  StaffAuthors,
  type StaffAuthor,
} from "../domain/staff-author-directory.js";

const AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  ...HELD_ROLE_SELECT,
  jobTitle: true,
  auth0Id: true,
} as const;

interface AuthorRow extends HeldRoleRow {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly jobTitle: string;
  readonly auth0Id: string | null;
}

/**
 * Adaptateur de {@link StaffAuthorDirectory} : deux lectures quel que soit le
 * nombre de références, zéro compris — la table des `sub`, puis les fiches.
 *
 * L'ordre de résolution est celui du port, et il compte quand deux formes se
 * recouvrent : l'**id** de fiche d'abord, puis la **table des `sub`** (le lien
 * que la base a elle-même établi), puis l'`auth0_id` — qui couvre une liaison
 * écrite par une instance antérieure à la table.
 */
@Injectable()
export class PrismaStaffAuthorDirectory extends StaffAuthorDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async identify(references: readonly (string | null)[]): Promise<StaffAuthors> {
    const wanted = distinct(references);
    // PAS de raccourci sur une liste vide, et c'est voulu : le coût d'une vue
    // ne doit pas dépendre de ce qu'elle contient. Sans quoi une fiche client
    // AVEC mercuriale coûte deux lectures de plus que la même SANS — ce que
    // `pricing-budget.e2e-spec.ts` interdit (« ne coûte pas plus cher parce que
    // le client a une mercuriale »). Deux lectures par vue, toujours.
    const aliases = await this.prisma.staffSubjectAlias.findMany({
      where: { sub: { in: wanted } },
      select: { sub: true, staffUserId: true },
    });
    const rows: readonly AuthorRow[] = await this.prisma.staffUser.findMany({
      where: {
        OR: [
          { id: { in: [...wanted, ...aliases.map((alias) => alias.staffUserId)] } },
          { auth0Id: { in: wanted } },
        ],
      },
      select: AUTHOR_SELECT,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const bySub = new Map(
      rows.flatMap((row) => (row.auth0Id === null ? [] : [[row.auth0Id, row]])),
    );
    const aliasOf = new Map(aliases.map((alias) => [alias.sub, alias.staffUserId]));

    const found = new Map<string, StaffAuthor>();
    for (const reference of wanted) {
      const aliased = aliasOf.get(reference);
      const row =
        byId.get(reference) ??
        (aliased === undefined ? undefined : byId.get(aliased)) ??
        bySub.get(reference);
      if (row !== undefined) {
        found.set(reference, toAuthor(row));
      }
    }
    return new StaffAuthors(found);
  }
}

/**
 * Adaptateur de {@link StaffAuthorReferences} : retrouve la fiche par la même
 * résolution que l'annuaire, puis rassemble tout ce sous quoi elle a écrit.
 */
@Injectable()
export class PrismaStaffAuthorReferences extends StaffAuthorReferences {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: StaffAuthorDirectory,
  ) {
    super();
  }

  async referencesOf(reference: string): Promise<readonly string[]> {
    const author = (await this.directory.identify([reference])).find(reference);
    if (author === null) {
      return [reference];
    }
    const [fiche, aliases] = await Promise.all([
      this.prisma.staffUser.findUnique({
        where: { id: author.staffUserId },
        select: { auth0Id: true },
      }),
      this.prisma.staffSubjectAlias.findMany({
        where: { staffUserId: author.staffUserId },
        select: { sub: true },
      }),
    ]);
    return distinct([
      reference,
      author.staffUserId,
      fiche?.auth0Id ?? null,
      ...aliases.map((alias) => alias.sub),
    ]);
  }
}

function toAuthor(row: AuthorRow): StaffAuthor {
  return {
    staffUserId: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    role: heldRoleKey(row) ?? "",
    roleLabel: heldRoleLabel(row),
    jobTitle: row.jobTitle,
  };
}

/** Les références utiles, sans doublon ni vide — l'ordre d'arrivée est gardé. */
function distinct(references: readonly (string | null)[]): string[] {
  return [
    ...new Set(
      references.filter(
        (reference): reference is string => reference !== null && reference.trim() !== "",
      ),
    ),
  ];
}
