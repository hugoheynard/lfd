import { Global, Module } from "@nestjs/common";

import { PrismaOrderingChorusServiceReader } from "../lafoliecoffee/account/infrastructure/prisma-ordering-chorus-service.reader.js";
import { PrismaPayerCommitmentRequirements } from "../lafoliecoffee/account/infrastructure/prisma-payer-commitment-requirements.js";
import { OrderingChorusServiceReader } from "../lafoliecoffee/orders/domain/ports/ordering-chorus-service.reader.js";
import { PayerCommitmentRequirements } from "../lafoliecoffee/orders/domain/ports/payer-commitment-requirements.js";

/**
 * **La passation lit ce que le payeur exige de l'engagement budgétaire**
 * (plan `plan-clients-publics-chorus.md`, § 6 quater, E2′). La commande
 * déclare le port, le compte client l'implémente sur sa fiche Chorus ; la
 * liaison vit ici pour que ni l'un ni l'autre ne câble l'autre.
 *
 * La fiche du service Chorus de la société qui commande (§ 6 octies) suit le
 * même chemin : `OrderingChorusServiceReader`, déclaré par la commande, lu sur
 * `company_chorus_service`.
 *
 * `@Global` comme `AccountOrderEngagementModule` : le consommateur est
 * `orders`, et le câblage ne vit dans aucun des deux modules.
 */
@Global()
@Module({
  providers: [
    { provide: PayerCommitmentRequirements, useClass: PrismaPayerCommitmentRequirements },
    { provide: OrderingChorusServiceReader, useClass: PrismaOrderingChorusServiceReader },
  ],
  exports: [PayerCommitmentRequirements, OrderingChorusServiceReader],
})
export class PayerCommitmentRequirementsModule {}
