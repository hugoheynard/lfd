import { Global, Module } from "@nestjs/common";

import { GestureIntentLedger } from "./gesture-intent.js";
import { OncePerIntent } from "./once-per-intent.js";
import { PrismaGestureIntentLedger } from "./prisma-gesture-intent.ledger.js";

/**
 * **Les intentions des gestes**, technique pure. `@Global` comme la boîte
 * d'envoi : le compte client, l'annuaire, la comptabilité, les paiements, les
 * commandes et le bloc `mail` s'en servent sans réimport.
 */
@Global()
@Module({
  providers: [{ provide: GestureIntentLedger, useClass: PrismaGestureIntentLedger }, OncePerIntent],
  exports: [GestureIntentLedger, OncePerIntent],
})
export class IntentModule {}
