import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../../infra/database/pim-database.module.js";
import { PimChangesModule } from "../../changes/pim-changes.module.js";
import { SalesContextsModule } from "../sales-contexts/sales-contexts.module.js";
import { CreateVatRateHandler } from "./application/create-vat-rate.js";
import { ListVatRatesHandler } from "./application/list-vat-rates.js";
import { ArchiveVatRateHandler } from "./application/archive-vat-rate.js";
import { RestoreVatRateHandler } from "./application/restore-vat-rate.js";
import { UpdateVatRateHandler } from "./application/update-vat-rate.js";
import { VatRateRepository } from "./domain/ports/vat-rate.repository.js";
import { VatRateUsageReader } from "./domain/ports/vat-rate-usage.reader.js";
import { VatRateLock } from "./domain/ports/vat-rate.lock.js";
import { VatRateController } from "./http/vat-rate.controller.js";
import { PrismaVatRateRepository } from "./infrastructure/prisma-vat-rate.repository.js";
import { PrismaVatRateUsageReader } from "./infrastructure/prisma-vat-rate-usage.reader.js";
import { PrismaVatRateLock } from "./infrastructure/prisma-vat-rate.lock.js";

/**
 * Contexte **vat-rates** — le référentiel des taux de TVA.
 *
 * Il s'appelait `commerce/`, un nom qui promettait un domaine et n'a jamais
 * tenu que ça : quinze fichiers, tous des taux. Un dossier fourre-tout attire
 * ce qui n'a pas de place ailleurs ; celui-ci est nommé d'après ce qu'il
 * contient, comme `sales-contexts/` (et feu points-of-sale, retiré en L3).
 *
 * ⚠️ Les **codes d'erreur** restent `commerce.*` : ils voyagent sur le fil,
 * l'écran des taux en teste un, et les renommer serait un changement de contrat
 * — pas un rangement de dossier. À faire quand on touchera au contrat.
 *
 * Les références partagées, à commencer par les
 * **taux de TVA**. Modèle **CQRS** : les contrôleurs dispatchent sur les bus, les
 * handlers portent les invariants. Exporte `VatRateRepository` pour que les
 * catégories puissent valider leurs références (`emporterTvaId` / `surPlaceTvaId`),
 * et `VatRateLock` pour qu'elles les verrouillent avant de les relire.
 */
@Module({
  imports: [PimDatabaseModule, PimChangesModule, SalesContextsModule],
  controllers: [VatRateController],
  providers: [
    { provide: VatRateRepository, useClass: PrismaVatRateRepository },
    { provide: VatRateUsageReader, useClass: PrismaVatRateUsageReader },
    { provide: VatRateLock, useClass: PrismaVatRateLock },
    CreateVatRateHandler,
    UpdateVatRateHandler,
    ArchiveVatRateHandler,
    RestoreVatRateHandler,
    ListVatRatesHandler,
  ],
  exports: [VatRateRepository, VatRateLock],
})
export class VatRatesModule {}
