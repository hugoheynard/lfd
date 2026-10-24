import type { Provider } from "@nestjs/common";

import { BackfillOrderReceivedOnHandler } from "./application/commands/backfill-order-received-on.handler.js";
import { RecordOrderDeliveryDayHandler } from "./application/commands/record-order-delivery-day.handler.js";
import { RecordDeliveryDayOnHandover } from "./application/handlers/record-delivery-day-on-handover.handler.js";
import { ListUnconfirmedDeliveriesHandler } from "./application/queries/list-unconfirmed-deliveries.handler.js";
import { OrderDeliveryDays } from "./domain/ports/order-delivery-days.js";
import { UnconfirmedDeliveriesReader } from "./domain/ports/unconfirmed-deliveries.reader.js";
import { PrismaOrderDeliveryDays } from "./infrastructure/prisma-order-delivery-days.js";
import { PrismaUnconfirmedDeliveriesReader } from "./infrastructure/prisma-unconfirmed-deliveries.reader.js";

/**
 * Les providers du lot ZL (plan `plan-zero-faille.md`, §12) : le jour de
 * livraison d'un bon, posé à sa première remise, et les bons à constater. À
 * part du module, qui dépasse déjà la taille d'un fichier.
 */
export const DELIVERY_DAY_PROVIDERS: readonly Provider[] = [
  { provide: OrderDeliveryDays, useClass: PrismaOrderDeliveryDays },
  { provide: UnconfirmedDeliveriesReader, useClass: PrismaUnconfirmedDeliveriesReader },
  RecordOrderDeliveryDayHandler,
  BackfillOrderReceivedOnHandler,
  RecordDeliveryDayOnHandover,
  ListUnconfirmedDeliveriesHandler,
];
