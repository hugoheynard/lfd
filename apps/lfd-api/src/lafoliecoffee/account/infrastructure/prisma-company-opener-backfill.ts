import type { PrismaClient } from "../../../platform/database/client/client.js";
import { ACCOUNT_FACTS } from "../domain/events/account-facts.js";
import type {
  CompanyWithoutOpener,
  DeclarationTrace,
  OpenerBackfillLine,
} from "./company-opener-backfill-plan.js";

/** Les ids lus par lot : une liste `IN` bornée, jamais une requête par société. */
const ID_BATCH = 500;

/** Le sujet du fait `company.declared`. */
const COMPANY_SUBJECT = "company";

/**
 * **La reprise de l'auteur et du suiveur des fiches existantes** —
 * `documentation/b2b/plan-suivi-commercial.md`, § 3.1. Conduite par
 * `prisma/backfill-company-openers.ts`, à blanc par défaut.
 *
 * Deux lectures séparées, une par schéma — les principaux sans auteur dans
 * `public.companies`, puis leurs faits `company.declared` dans
 * `growth.activity_events` —, jointes en mémoire par
 * `planCompanyOpeners` : jamais une jointure SQL entre schémas.
 *
 * Rejouable : l'écriture est conditionnée sur un auteur encore vide, et le
 * suiveur n'est posé que là où il l'est aussi.
 */
export class PrismaCompanyOpenerBackfill {
  constructor(private readonly prisma: PrismaClient) {}

  /** Les principaux sans auteur — les sites (`parent_company_id`) sont de la structure, pas de l'acquisition. */
  async companiesWithoutOpener(): Promise<readonly CompanyWithoutOpener[]> {
    return this.prisma.company.findMany({
      where: { declaredByStaffId: null, parentCompanyId: null },
      select: { id: true, reference: true, followedByStaffId: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Les faits `company.declared` de ces sociétés, par lot d'ids. */
  async declarationsOf(companyIds: readonly string[]): Promise<readonly DeclarationTrace[]> {
    const traces: DeclarationTrace[] = [];
    for (let start = 0; start < companyIds.length; start += ID_BATCH) {
      const rows = await this.prisma.activityEvent.findMany({
        where: {
          type: ACCOUNT_FACTS.companyDeclared,
          subjectType: COMPANY_SUBJECT,
          subjectId: { in: companyIds.slice(start, start + ID_BATCH) },
        },
        select: { subjectId: true, actorType: true, actorId: true, actorName: true },
        orderBy: { occurredAt: "asc" },
      });
      traces.push(
        ...rows.map((row) => ({
          companyId: row.subjectId,
          actorType: row.actorType,
          actorId: row.actorId,
          actorName: row.actorName,
        })),
      );
    }
    return traces;
  }

  /**
   * Écrit une ligne `fill`, ou rien si une autre passe (ou une ouverture
   * réelle) a posé l'auteur entre la lecture et l'écriture.
   *
   * @returns `true` si la ligne a été écrite.
   */
  async write(line: Extract<OpenerBackfillLine, { kind: "fill" }>): Promise<boolean> {
    // Une transaction : l'auteur sans le suiveur ne se rattraperait plus, la
    // passe suivante sautant toute fiche qui a déjà un auteur.
    return this.prisma.$transaction(async (tx) => {
      const written = await tx.company.updateMany({
        where: { id: line.companyId, declaredByStaffId: null },
        data: { declaredByStaffId: line.declaredByStaffId, declaredByName: line.declaredByName },
      });
      if (written.count === 1 && line.followedByStaffId !== null) {
        await tx.company.updateMany({
          where: { id: line.companyId, followedByStaffId: null },
          data: { followedByStaffId: line.followedByStaffId },
        });
      }
      return written.count === 1;
    });
  }
}
