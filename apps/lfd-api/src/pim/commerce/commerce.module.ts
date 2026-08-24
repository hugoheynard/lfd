import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { PimIdGenerator, UuidV7Generator } from "../infra/id/pim-id-generator.js";
import { CreateVatRateHandler } from "./application/create-vat-rate.js";
import { ListVatRatesHandler } from "./application/list-vat-rates.js";
import { RemoveVatRateHandler } from "./application/remove-vat-rate.js";
import { UpdateVatRateHandler } from "./application/update-vat-rate.js";
import { VatRateRepository } from "./domain/ports/vat-rate.repository.js";
import { VatRateController } from "./http/vat-rate.controller.js";
import { PrismaVatRateRepository } from "./infrastructure/prisma-vat-rate.repository.js";

/**
 * Contexte **commerce** — les références commerciales partagées, à commencer par les
 * **taux de TVA**. Modèle **CQRS** : les contrôleurs dispatchent sur les bus, les
 * handlers portent les invariants. Exporte `VatRateRepository` pour que les
 * catégories puissent valider leurs références (`emporterTvaId` / `surPlaceTvaId`).
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [VatRateController],
  providers: [
    { provide: PimIdGenerator, useClass: UuidV7Generator },
    { provide: VatRateRepository, useClass: PrismaVatRateRepository },
    CreateVatRateHandler,
    UpdateVatRateHandler,
    RemoveVatRateHandler,
    ListVatRatesHandler,
  ],
  exports: [VatRateRepository],
})
export class CommerceModule {}
