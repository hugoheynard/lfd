import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  catalogSnapshotSchema,
  type CatalogIngestionReport,
  type CatalogSnapshot,
} from "@lfd/catalog-sync";

import { Public } from "../../infra/auth/public.decorator.js";
import { CatalogIngestGuard } from "../../infra/auth/catalog-ingest.guard.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { CatalogIngestionRepository } from "../domain/catalog.repository.js";

/**
 * **L'entrée du catalogue** poussé par le PIM.
 *
 * `@Public()` retire la porte staff — un backend n'a pas de session — et
 * `CatalogIngestGuard` en pose une autre à la place : le secret partagé. Les
 * deux décorateurs se lisent ensemble ; l'un sans l'autre serait une erreur.
 *
 * Le payload est **revalidé** par le schéma du contrat de fil, y compris sa
 * version. Un snapshot d'une version inconnue est refusé plutôt qu'ingéré à
 * moitié : un catalogue partiellement écrit facture des prix qui n'ont jamais
 * été décidés ensemble.
 */
@Public()
@UseGuards(CatalogIngestGuard)
@Controller("catalog")
export class CatalogIngestController {
  constructor(private readonly ingestion: CatalogIngestionRepository) {}

  @Post("ingest")
  async ingest(
    @Body(new ZodBody(catalogSnapshotSchema)) snapshot: CatalogSnapshot,
  ): Promise<CatalogIngestionReport> {
    const outcome = await this.ingestion.apply(snapshot);
    return {
      acceptedProducts: outcome.acceptedProducts,
      acceptedVariants: outcome.acceptedVariants,
      acceptedCategories: outcome.acceptedCategories,
      removedSkus: [...outcome.removedSkus],
      appliedAt: new Date().toISOString(),
    };
  }
}
