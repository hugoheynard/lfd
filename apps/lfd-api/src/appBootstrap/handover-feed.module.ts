import { Global, Module } from "@nestjs/common";

import { OrdersModule } from "../b2b/orders/orders.module.js";
import { PrismaDeliveryRunSheetReader } from "../b2b/orders/infrastructure/prisma-delivery-run-sheet.reader.js";
import { PrismaHandoverQueueReader } from "../b2b/orders/infrastructure/prisma-handover-queue.reader.js";
import { PrismaHandoverSubjectReader } from "../b2b/orders/infrastructure/prisma-handover-subject.reader.js";
import {
  DeliveryRunSheetReader,
  HandoverProofReader,
  HandoverQueueReader,
  HandoverSubjectReader,
} from "../handover/channels/commerce/index.js";
import { PrismaHandoverProofReader } from "../handover/infrastructure/prisma-handover-proof.reader.js";
import { PrismaAttestedHandoversReader } from "../handover/infrastructure/prisma-attested-handovers.reader.js";
import { PrismaOrderCustodyReader } from "../handover/infrastructure/prisma-order-custody.reader.js";
import {
  AtelierSheetsReader,
  AttestedHandoversReader,
  OrderCustodyReader,
  QualityHoldsReader,
} from "../production/channels/handover/index.js";
import { PrismaAtelierSheetsReader } from "../production/infrastructure/prisma-atelier-sheets.reader.js";
import { PrismaQualityHoldsReader } from "../production/infrastructure/prisma-quality-holds.reader.js";
import { ProductionModule } from "../production/production.module.js";

/**
 * **Les deux fils de la remise, reliés.**
 *
 * Ce module est le seul du dossier à brancher un port **dans chaque sens**, et
 * c'est ce qui le rend instructif :
 *
 * - `HandoverSubjectReader`, `HandoverQueueReader` et `DeliveryRunSheetReader`
 *   — la **remise déclare**, le commerce implémente. Le comptoir a besoin de la
 *   commande derrière un jeton, de la file du jour, et la feuille de route des
 *   livraisons ; il ne va lire aucune des trois.
 * - `AttestedHandoversReader` — la **production déclare**, la remise implémente.
 *   Le fournil a besoin de savoir ce qui a été attesté depuis sa clôture ; il ne
 *   va pas le lire non plus. `OrderCustodyReader` (2026-10-01, BQ), même
 *   sens : le fournil demande lesquelles sont parties ou retirées.
 * - `QualityHoldsReader` et `AtelierSheetsReader` — la **production publie ET
 *   implémente**, la remise lit. Le comptoir demande quelles commandes un contrôle retient ; la
 *   réponse est un fait de la production (`plan-controle-qualite.md`, D4).
 *
 * - `HandoverProofReader` (2026-10-02) — la **remise publie ET implémente**,
 *   le commerce lit : les preuves de remise à la porte, pour la fiche d'une
 *   commande. Même figure que `QualityHoldsReader`, dans l'autre sens.
 *
 * 🔴 Aucun des trois contextes ne connaît les deux autres. C'est la racine de
 * composition qui sait, et elle seule — sans quoi la dépendance reviendrait par
 * l'autre bout et deux blocs se tiendraient l'un l'autre (§3 du `CLAUDE.md`).
 *
 * `@Global` pour la raison des deux autres fils : les consommateurs de ces
 * ports sont `handover/` et `production/`, qui ne peuvent pas importer le module
 * qui les fournit sans devenir dépendants de ceux qui les implémentent. Les
 * jetons restent ceux des contextes déclarants — rien de neuf n'est rendu
 * atteignable.
 */
@Global()
@Module({
  imports: [OrdersModule, ProductionModule],
  providers: [
    { provide: HandoverSubjectReader, useClass: PrismaHandoverSubjectReader },
    { provide: HandoverQueueReader, useClass: PrismaHandoverQueueReader },
    { provide: AttestedHandoversReader, useClass: PrismaAttestedHandoversReader },
    { provide: QualityHoldsReader, useClass: PrismaQualityHoldsReader },
    { provide: DeliveryRunSheetReader, useClass: PrismaDeliveryRunSheetReader },
    { provide: AtelierSheetsReader, useClass: PrismaAtelierSheetsReader },
    { provide: OrderCustodyReader, useClass: PrismaOrderCustodyReader },
    { provide: HandoverProofReader, useClass: PrismaHandoverProofReader },
  ],
  exports: [
    HandoverSubjectReader,
    HandoverQueueReader,
    AttestedHandoversReader,
    QualityHoldsReader,
    DeliveryRunSheetReader,
    AtelierSheetsReader,
    OrderCustodyReader,
    HandoverProofReader,
  ],
})
export class HandoverFeedModule {}
