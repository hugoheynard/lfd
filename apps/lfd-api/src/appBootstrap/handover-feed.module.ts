import { Global, Module } from "@nestjs/common";

import { OrdersModule } from "../b2b/orders/orders.module.js";
import { PrismaHandoverQueueReader } from "../b2b/orders/infrastructure/prisma-handover-queue.reader.js";
import { PrismaHandoverSubjectReader } from "../b2b/orders/infrastructure/prisma-handover-subject.reader.js";
import { HandoverQueueReader, HandoverSubjectReader } from "../handover/channels/commerce/index.js";
import { PrismaAttestedHandoversReader } from "../handover/infrastructure/prisma-attested-handovers.reader.js";
import { AttestedHandoversReader } from "../production/channels/handover/index.js";

/**
 * **Les deux fils de la remise, reliés.**
 *
 * Ce module est le seul du dossier à brancher un port **dans chaque sens**, et
 * c'est ce qui le rend instructif :
 *
 * - `HandoverSubjectReader` et `HandoverQueueReader` — la **remise déclare**, le
 *   commerce implémente. Le comptoir a besoin de la commande derrière un jeton,
 *   et de la file du jour ; il ne va lire ni l'une ni l'autre.
 * - `AttestedHandoversReader` — la **production déclare**, la remise implémente.
 *   Le fournil a besoin de savoir ce qui a été attesté depuis sa clôture ; il ne
 *   va pas le lire non plus.
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
  imports: [OrdersModule],
  providers: [
    { provide: HandoverSubjectReader, useClass: PrismaHandoverSubjectReader },
    { provide: HandoverQueueReader, useClass: PrismaHandoverQueueReader },
    { provide: AttestedHandoversReader, useClass: PrismaAttestedHandoversReader },
  ],
  exports: [HandoverSubjectReader, HandoverQueueReader, AttestedHandoversReader],
})
export class HandoverFeedModule {}
