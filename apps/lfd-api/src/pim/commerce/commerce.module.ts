import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { PimIdGenerator, UuidV7Generator } from "../infra/id/pim-id-generator.js";
import { CreateTvaRateHandler } from "./application/create-tva-rate.js";
import { ListTvaRatesHandler } from "./application/list-tva-rates.js";
import { RemoveTvaRateHandler } from "./application/remove-tva-rate.js";
import { UpdateTvaRateHandler } from "./application/update-tva-rate.js";
import { TvaRateRepository } from "./domain/ports/tva-rate.repository.js";
import { TvaRateController } from "./http/tva-rate.controller.js";
import { PrismaTvaRateRepository } from "./infrastructure/prisma-tva-rate.repository.js";

/**
 * Contexte **commerce** — les références commerciales partagées, à commencer par les
 * **taux de TVA**. Modèle **CQRS** : les contrôleurs dispatchent sur les bus, les
 * handlers portent les invariants. Exporte `TvaRateRepository` pour que les
 * catégories puissent valider leurs références (`emporterTvaId` / `surPlaceTvaId`).
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [TvaRateController],
  providers: [
    { provide: PimIdGenerator, useClass: UuidV7Generator },
    { provide: TvaRateRepository, useClass: PrismaTvaRateRepository },
    CreateTvaRateHandler,
    UpdateTvaRateHandler,
    RemoveTvaRateHandler,
    ListTvaRatesHandler,
  ],
  exports: [TvaRateRepository],
})
export class CommerceModule {}
