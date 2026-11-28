import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ProductionDocumentStore } from "../../../../platform/storage/production-document-store.js";
import { PlanVersionListing, ServiceDay } from "../../../day/index.js";
import { type ProductionPaper, productionCountPdfKey } from "../../../shared/print/index.js";
import {
  PlanVersionPaperNotArchivedError,
  PlanVersionPaperUnknownVersionError,
} from "../../domain/errors/dossier-resend-errors.js";
import { dayDossierPdfKey } from "../../domain/services/day-dossier-pdf.js";
import {
  GetPlanVersionPaperQuery,
  type PlanVersionPaperKind,
} from "./get-plan-version-paper.query.js";

/** La clé d'un papier de version, et le nom du fichier servi. */
function placeOf(
  serviceDay: string,
  closedAt: Date,
  version: number,
  kind: PlanVersionPaperKind,
): { readonly key: string; readonly fileName: string } {
  const suffix = `${serviceDay}-version-${String(version)}.pdf`;
  return kind === "dossier"
    ? {
        key: dayDossierPdfKey(serviceDay, closedAt, null, version),
        fileName: `dossier-du-jour-${suffix}`,
      }
    : {
        key: productionCountPdfKey(serviceDay, closedAt, null, version),
        fileName: `compte-a-produire-${suffix}`,
      };
}

/**
 * **Le papier rangé d'une version passée** (lot H6, décision de
 * l'orchestrateur du 2026-11-28) : lu au stockage sous la clé de la version,
 * ou 404. Il ne fabrique JAMAIS un papier ancien (§ 4 du plan) : refait
 * aujourd'hui, il dirait l'état d'aujourd'hui sous le numéro d'hier.
 *
 * Une version sans papier propre (un retrait, § 1.14) sert celui de la
 * version dont le papier tient lieu — le même que la liste annonce.
 *
 * @throws {PlanVersionPaperUnknownVersionError} la journée n'a pas cette version.
 * @throws {PlanVersionPaperNotArchivedError} son papier n'est pas rangé.
 */
@QueryHandler(GetPlanVersionPaperQuery)
export class GetPlanVersionPaperHandler implements IQueryHandler<
  GetPlanVersionPaperQuery,
  ProductionPaper
> {
  constructor(
    private readonly listing: PlanVersionListing,
    private readonly documents: ProductionDocumentStore,
  ) {}

  async execute(query: GetPlanVersionPaperQuery): Promise<ProductionPaper> {
    const day = ServiceDay.of(query.serviceDay);
    const entries = await this.listing.listOf(day);
    const entry = entries.find((one) => one.version === query.version);
    if (entry === undefined) {
      throw new PlanVersionPaperUnknownVersionError(day.value, query.version);
    }
    const owner = entries.find((one) => one.version === entry.paperVersion);
    if (owner === undefined) {
      throw new PlanVersionPaperNotArchivedError(day.value, query.version);
    }
    const place = placeOf(day.value, owner.closedAt, owner.version, query.kind);
    const bytes = await this.documents.readIfPresent(place.key);
    if (bytes === null) {
      throw new PlanVersionPaperNotArchivedError(day.value, query.version);
    }
    return { bytes, fileName: place.fileName };
  }
}
