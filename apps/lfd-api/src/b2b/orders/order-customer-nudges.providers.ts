import type { Provider } from "@nestjs/common";

import { SendHandoverReminderHandler } from "./application/commands/send-handover-reminder.handler.js";
import { WarnCustomerOfDelayHandler } from "./application/commands/warn-customer-of-delay.handler.js";
import { GetCustomerNudgesHandler } from "./application/queries/get-customer-nudges.handler.js";
import { CustomerNudgeDelaysReader } from "./domain/ports/customer-nudge-delays.reader.js";
import { CustomerNudgeTraceReader } from "./domain/ports/customer-nudge-trace.reader.js";
import { OrderCustomerNudgesRepository } from "./domain/ports/order-customer-nudges.repository.js";
import { PrismaCustomerNudgeTraceReader } from "./infrastructure/prisma-customer-nudge-trace.reader.js";
import { PrismaOrderCustomerNudgesRepository } from "./infrastructure/prisma-order-customer-nudges.repository.js";
import { SettingsCustomerNudgeDelaysReader } from "./infrastructure/settings-customer-nudge-delays.reader.js";

/**
 * Les providers des **deux relances d'un retrait en retard** (Hugo,
 * 2026-10-25) — « Rappel au client » et « Avertir le client », depuis la
 * Supervision, et la lecture de leurs traces. À part du module, qui dépasse
 * déjà la taille d'un fichier. Les routes vivent dans
 * `AdminOrdersController` (les gestes) et `AdminSupervisionController` (la
 * lecture).
 */
export const ORDER_CUSTOMER_NUDGES_PROVIDERS: readonly Provider[] = [
  SendHandoverReminderHandler,
  WarnCustomerOfDelayHandler,
  GetCustomerNudgesHandler,
  { provide: OrderCustomerNudgesRepository, useClass: PrismaOrderCustomerNudgesRepository },
  { provide: CustomerNudgeTraceReader, useClass: PrismaCustomerNudgeTraceReader },
  { provide: CustomerNudgeDelaysReader, useClass: SettingsCustomerNudgeDelaysReader },
];
