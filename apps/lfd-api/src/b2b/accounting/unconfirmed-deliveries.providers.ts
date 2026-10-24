import type { Provider } from "@nestjs/common";

import { ListUnconfirmedDeliveriesHandler } from "./application/queries/list-unconfirmed-deliveries.handler.js";
import { UnconfirmedDeliveriesReader } from "./domain/ports/unconfirmed-deliveries.reader.js";
import { PrismaUnconfirmedDeliveriesReader } from "./infrastructure/prisma-unconfirmed-deliveries.reader.js";

/**
 * Les « bons à constater » du lot ZL (plan `plan-zero-faille.md`, §12). À part
 * du module, qui dépasse déjà la taille d'un fichier.
 *
 * La date de réception n'a plus d'écrivain ici depuis B4 du plan
 * `documentation/commandes/date-de-reception.md` : la remise la pose
 * (`MarkOrderFulfilledHandler`), et la base refuse l'une sans l'autre.
 */
export const UNCONFIRMED_DELIVERIES_PROVIDERS: readonly Provider[] = [
  { provide: UnconfirmedDeliveriesReader, useClass: PrismaUnconfirmedDeliveriesReader },
  ListUnconfirmedDeliveriesHandler,
];
