import type { Provider } from "@nestjs/common";

import { DeclareOrderNoShowHandler } from "./application/commands/declare-order-no-show.handler.js";
import { RequestNoShowNoticeHandler } from "./application/commands/request-no-show-notice.handler.js";
import { OrderNoShowReader } from "./domain/ports/order-no-show.reader.js";
import { OrderNoShowRepository } from "./domain/ports/order-no-show.repository.js";
import { PrismaOrderNoShowReader } from "./infrastructure/prisma-order-no-show.reader.js";
import { PrismaOrderNoShowRepository } from "./infrastructure/prisma-order-no-show.repository.js";

/**
 * Les providers de la **commande non retirée** (`commande-particulier-reglee-en-boutique.md`,
 * § 5 bis) — « Le client n'est pas venu », « Prévenir le client », et la
 * lecture de leurs traces par la fiche. À part du module, qui dépasse déjà la
 * taille d'un fichier. Les routes vivent dans `AdminCounterNoShowController`.
 *
 * Le compte par client publié pour la recherche des particuliers
 * (`ParticularNoShowCountsReader`) n'est pas ici : son consommateur est le
 * compte, et il est relié par `appBootstrap/particular-no-show-counts.module.ts`.
 */
export const ORDER_NO_SHOW_PROVIDERS: readonly Provider[] = [
  DeclareOrderNoShowHandler,
  RequestNoShowNoticeHandler,
  { provide: OrderNoShowRepository, useClass: PrismaOrderNoShowRepository },
  { provide: OrderNoShowReader, useClass: PrismaOrderNoShowReader },
];
