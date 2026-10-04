import { Module } from "@nestjs/common";

import { OnHandedToPacking } from "./application/handlers/on-handed-to-packing.handler.js";
import { OnPackingListDrawn } from "./application/handlers/on-packing-list-drawn.handler.js";
import { OnReturnRequested } from "./application/handlers/on-return-requested.handler.js";
import { ComparePackingShadowHandler } from "./application/queries/compare-packing-shadow.handler.js";
import { PackingShadowLedger } from "./domain/ports/packing-shadow.ledger.js";
import { PackingShadowReader } from "./domain/ports/packing-shadow.reader.js";
import { PackingShadowController } from "./http/packing-shadow.controller.js";
import { PrismaPackingShadowLedger } from "./infrastructure/prisma-packing-shadow.ledger.js";
import { PrismaPackingShadowReader } from "./infrastructure/prisma-packing-shadow.reader.js";

/**
 * **Le colisage** — son propre bloc depuis le 2026-10-04 (plan
 * `documentation/colisage/plan-domaine-colisage.md`, §12–§13).
 *
 * En K1, il ne tient qu'une OMBRE : trois abonnés durables remplissent le
 * schéma `packing` à partir des faits du fournil, et une route de contrôle
 * compare. Le poste réel reste celui du fournil (`production_day.packing_owner
 * = legacy`).
 *
 * `LegacyPackingReader` n'est pas déclaré ici : c'est un port que la
 * production publie et implémente, relié par `PackingFeedModule` — le
 * colisage n'importe pas le module du fournil.
 */
@Module({
  controllers: [PackingShadowController],
  providers: [
    OnPackingListDrawn,
    OnHandedToPacking,
    OnReturnRequested,
    ComparePackingShadowHandler,
    { provide: PackingShadowLedger, useClass: PrismaPackingShadowLedger },
    { provide: PackingShadowReader, useClass: PrismaPackingShadowReader },
  ],
})
export class PackingModule {}
