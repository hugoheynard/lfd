import { Injectable, Logger } from "@nestjs/common";

import { DocumentStorageUnavailableError } from "../../../../platform/shared/errors/storage-errors.js";
import { ProductionPaperArchive, productionCountPdfKey } from "../../../shared/print/index.js";
import { dayDossierPdfKey } from "../../domain/services/day-dossier-pdf.js";
import type { PlanVersionPaperView } from "../queries/plan-version.views.js";

/** Une version qui a un papier propre, et l'arrêt auquel elle appartient. */
export interface PaperOwner {
  readonly version: number;
  readonly closedAt: Date;
}

/** « Papier rangé ou non » de chaque version demandée, prêt à servir. */
export interface PlanVersionPapers {
  of(version: number | null): PlanVersionPaperView;
}

const UNKNOWN = null;

/**
 * **Le papier de chaque version, lu au stockage**
 * (`documentation/fournil/plan-historique-des-tirages.md`, § 1.12) — jamais
 * en base, et rien n'est écrit. Le dossier et le compte à produire, sous la
 * clé de leur version (`dayDossierPdfKey`, `productionCountPdfKey`).
 *
 * `ProductionPaperArchive.isArchived` lit l'objet entier : une journée a
 * quelques versions et un dossier pèse de l'ordre de 200 Ko (spécimen,
 * 2026-11-27), lus en parallèle — acceptable sans lecture d'existence au
 * port de stockage. Une version demandée deux fois (un retrait renvoie au
 * papier d'avant) n'est lue qu'une fois.
 *
 * Un stockage qui ne répond pas rend `null` pour ce papier — « on ne sait
 * pas » —, jamais « non rangé », et ne fait pas tomber la liste.
 */
@Injectable()
export class PlanVersionPaperShelf {
  private readonly logger = new Logger(PlanVersionPaperShelf.name);

  constructor(private readonly archive: ProductionPaperArchive) {}

  async papersOf(serviceDay: string, owners: readonly PaperOwner[]): Promise<PlanVersionPapers> {
    const distinct = new Map(owners.map((owner) => [owner.version, owner]));
    const found = await Promise.all(
      [...distinct.values()].map(
        async (owner) => [owner.version, await this.paperOf(serviceDay, owner)] as const,
      ),
    );
    const byVersion = new Map(found);
    return {
      of: (version) =>
        (version === null ? undefined : byVersion.get(version)) ?? {
          version,
          dossier: version === null ? false : UNKNOWN,
          count: version === null ? false : UNKNOWN,
        },
    };
  }

  private async paperOf(serviceDay: string, owner: PaperOwner): Promise<PlanVersionPaperView> {
    const { version, closedAt } = owner;
    const [dossier, count] = await Promise.all([
      this.archived(dayDossierPdfKey(serviceDay, closedAt, null, version)),
      this.archived(productionCountPdfKey(serviceDay, closedAt, null, version)),
    ]);
    return { version, dossier, count };
  }

  private async archived(key: string): Promise<boolean | null> {
    try {
      return await this.archive.isArchived(key);
    } catch (error) {
      if (error instanceof DocumentStorageUnavailableError) {
        this.logger.warn(`Papier « ${key} » : le stockage n'a pas répondu.`);
        return UNKNOWN;
      }
      throw error;
    }
  }
}
