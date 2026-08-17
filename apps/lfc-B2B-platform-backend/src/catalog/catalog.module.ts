import { Module } from "@nestjs/common";

import { CatalogIngestionRepository, CatalogReader } from "./domain/catalog.repository.js";
import { PrismaCatalogIngestionRepository } from "./infrastructure/prisma-catalog-ingestion.repository.js";
import { PrismaCatalogReader } from "./infrastructure/prisma-catalog.reader.js";
import { CatalogIngestController } from "./http/catalog-ingest.controller.js";

/**
 * **Le catalogue de la plateforme** : ce que le PIM pousse, plus ce qu'on décide
 * ici (prix B2B, visibilité).
 *
 * Deux ports exportés parce qu'ils servent deux mondes : `CatalogReader` est
 * l'autorité de prix du checkout et de l'affichage ; `CatalogIngestionRepository`
 * n'est utilisé que par l'entrée du push. Les séparer évite qu'un chemin de
 * paiement dépende de méthodes capables de réécrire le catalogue (ISP).
 *
 * Pas d'agrégat ici, et c'est un choix : la table reçue n'a aucune transition
 * (elle est remplacée), et l'override non plus (prix, deux drapeaux). Forcer un
 * agrégat serait de la cérémonie — cf. la question de tri du CLAUDE.md, « existe-
 * t-il une règle qui peut refuser cette écriture ? ».
 */
@Module({
  controllers: [CatalogIngestController],
  providers: [
    { provide: CatalogIngestionRepository, useClass: PrismaCatalogIngestionRepository },
    { provide: CatalogReader, useClass: PrismaCatalogReader },
  ],
  exports: [CatalogReader, CatalogIngestionRepository],
})
export class CatalogModule {}
