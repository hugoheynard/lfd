import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { DatabaseModule } from '../infra/database/database.module.js';
import {
  IdGenerator,
  UuidV7Generator,
} from '../shared/identity/id-generator.js';
import { CreateTvaRegimeHandler } from './application/create-tva-regime.js';
import { ListTvaRegimesHandler } from './application/list-tva-regimes.js';
import { RemoveTvaRegimeHandler } from './application/remove-tva-regime.js';
import { UpdateTvaRegimeHandler } from './application/update-tva-regime.js';
import { TvaRegimeRepository } from './domain/ports/tva-regime.repository.js';
import { TvaRegimeController } from './http/tva-regime.controller.js';
import { PrismaTvaRegimeRepository } from './infrastructure/prisma-tva-regime.repository.js';

/**
 * Contexte **commerce** — les références commerciales partagées, à commencer par les
 * **régimes de TVA**. Modèle **CQRS** : les contrôleurs dispatchent sur les bus, les
 * handlers portent les invariants. Exporte `TvaRegimeRepository` pour que les
 * catégories puissent valider leurs références (`emporterTvaId` / `surPlaceTvaId`).
 */
@Module({
  imports: [DatabaseModule, CqrsModule],
  controllers: [TvaRegimeController],
  providers: [
    { provide: IdGenerator, useClass: UuidV7Generator },
    { provide: TvaRegimeRepository, useClass: PrismaTvaRegimeRepository },
    CreateTvaRegimeHandler,
    UpdateTvaRegimeHandler,
    RemoveTvaRegimeHandler,
    ListTvaRegimesHandler,
  ],
  exports: [TvaRegimeRepository],
})
export class CommerceModule {}
