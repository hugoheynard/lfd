import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { inBatches } from "../../../platform/post-deploy/batches.js";
import {
  PostDeployOperation,
  type OperationReport,
  type PostDeployApplication,
} from "../../../platform/post-deploy/post-deploy-operation.js";
import { Clock } from "../../../platform/time/clock.js";
import { OrderDiscountsTally } from "./order-discounts.tally.js";
import { PrismaOrderDiscountBackfill } from "./prisma-order-discount-backfill.js";
import { PrismaOrderDiscountTermsBackfill } from "./prisma-order-discount-terms-backfill.js";

/** La clé stable de l'opération. */
export const ORDER_DISCOUNTS_OPERATION_KEY = "order-discounts";

/** Elle passe après les politiques des mercuriales (§ 7.1) — clé recopiée : `b2b/orders` ne lit pas `pricing/infrastructure`. */
const AFTER_MERCURIALE_POLICIES = "mercuriale-promotion-policies";

/**
 * **Les remises des commandes**, comme opération après déploiement
 * (`documentation/ops/plan-operations-apres-deploiement.md`, § 7.1) : les
 * TROIS passes de `prisma/backfill-order-discounts.ts`, dans son ordre —
 * remises manquantes (M2), remises périmées (`--refresh-drifted`, M3), puis
 * termes figés. Le script reste pour la base locale.
 *
 * « À faire » = une remise à recréer, une remise périmée à reprendre, ou des
 * termes à déduire (§ 7.2). Les cas « à trancher » et « illisibles » sont
 * listés et ne tiennent pas l'opération ouverte.
 *
 * La simulation des termes ne voit pas les remises que les deux premières
 * passes écriraient (elles n'existent pas encore) ; l'application, si : elle
 * liste les termes APRÈS avoir écrit les remises.
 */
@Injectable()
export class OrderDiscountsOperation extends PostDeployOperation {
  readonly key = ORDER_DISCOUNTS_OPERATION_KEY;
  readonly title = "Remises des commandes";
  readonly why =
    "Les commandes remisées avant les remises de panier n'ont pas toutes leur remise en ligne, " +
    "certaines ont une remise périmée par une révision de l'ancien code, et les remises posées avant " +
    "« les remises acquises » n'ont pas de termes figés : sans eux, une révision ne sait pas rejuger la remise.";
  readonly limit =
    "Les termes figés sont déduits de la promotion telle qu'elle est aujourd'hui (archivée comprise), " +
    "marqués « backfilled », sans retour arrière. Une remise périmée est archivée puis reprise. " +
    "Sauvegarde de la base avant.";
  readonly after: readonly string[] = [AFTER_MERCURIALE_POLICIES];

  private readonly discounts: PrismaOrderDiscountBackfill;
  private readonly terms: PrismaOrderDiscountTermsBackfill;

  constructor(prisma: PrismaService, ids: IdGenerator, clock: Clock) {
    super();
    this.discounts = new PrismaOrderDiscountBackfill(prisma, ids, clock);
    this.terms = new PrismaOrderDiscountTermsBackfill(prisma);
  }

  async simulate(): Promise<OperationReport> {
    const tally = new OrderDiscountsTally();
    for (const orderId of await this.discounts.pendingOrderIds()) {
      tally.missing(await this.discounts.recover(orderId, false));
    }
    for (const order of await this.discounts.drifted()) {
      tally.drifted(await this.discounts.refresh(order.orderId, false));
    }
    for (const discountId of await this.terms.pendingDiscountIds()) {
      tally.terms(await this.terms.fill(discountId, false));
    }
    return tally.report();
  }

  async apply(run: PostDeployApplication): Promise<OperationReport> {
    const tally = new OrderDiscountsTally();
    for (const batch of inBatches(await this.discounts.pendingOrderIds())) {
      for (const orderId of batch) {
        tally.missing(await this.discounts.recover(orderId, true));
      }
      await run.progress(tally.report());
    }
    const drifted = (await this.discounts.drifted()).map((order) => order.orderId);
    for (const batch of inBatches(drifted)) {
      for (const orderId of batch) {
        tally.drifted(await this.discounts.refresh(orderId, true));
      }
      await run.progress(tally.report());
    }
    // Après les remises : une remise que les passes précédentes viennent
    // d'écrire a, elle aussi, ses termes à déduire.
    for (const batch of inBatches(await this.terms.pendingDiscountIds())) {
      for (const discountId of batch) {
        tally.terms(await this.terms.fill(discountId, true));
      }
      await run.progress(tally.report());
    }
    return tally.report();
  }
}
