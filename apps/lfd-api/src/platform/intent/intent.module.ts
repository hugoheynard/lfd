import { Global, Module } from "@nestjs/common";

import { GestureIntentLedger } from "./gesture-intent.js";
import { GestureIntentPruner } from "./gesture-intent-pruner.js";
import { GestureIntentPurgeController } from "./gesture-intent-purge.controller.js";
import { OncePerIntent } from "./once-per-intent.js";
import { PrismaGestureIntentLedger } from "./prisma-gesture-intent.ledger.js";
import { PrismaGestureIntentPruner } from "./prisma-gesture-intent.pruner.js";
import { PurgeGestureIntentsHandler } from "./purge-gesture-intents.handler.js";

/**
 * **Les intentions des gestes**, technique pure. `@Global` comme la boîte
 * d'envoi : le compte client, l'annuaire, la comptabilité, les paiements, les
 * commandes et le bloc `mail` s'en servent sans réimport. La purge n'est pas
 * exportée : seul le passage nocturne s'en sert.
 */
@Global()
@Module({
  controllers: [GestureIntentPurgeController],
  providers: [
    { provide: GestureIntentLedger, useClass: PrismaGestureIntentLedger },
    { provide: GestureIntentPruner, useClass: PrismaGestureIntentPruner },
    OncePerIntent,
    PurgeGestureIntentsHandler,
  ],
  exports: [GestureIntentLedger, OncePerIntent],
})
export class IntentModule {}
