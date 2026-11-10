import type { Provider, Type } from "@nestjs/common";

import { ApplyCardIncreaseHandler } from "./application/commands/apply-card-increase.handler.js";
import { ExpireCardIncreasesHandler } from "./application/commands/expire-card-increases.handler.js";
import { RelaunchCardIncreaseHandler } from "./application/commands/relaunch-card-increase.handler.js";
import { SweepCardIncreasesHandler } from "./application/commands/sweep-card-increases.handler.js";
import { RefundLateComplement } from "./application/handlers/refund-late-complement.handler.js";
import { RefundRefusedIncrease } from "./application/handlers/refund-refused-increase.handler.js";
import { BusCardIncreaseWake } from "./application/services/bus-card-increase-wake.js";
import { CardIncreaseBell } from "./application/services/card-increase-bell.js";
import { CardIncreaseCancellation } from "./application/services/card-increase-cancellation.js";
import {
  BusCardIncreaseDispatch,
  CardIncreaseDispatch,
} from "./application/services/card-increase-dispatch.js";
import { CardIncreaseOutcomes } from "./application/services/card-increase-outcomes.js";
import { CardIncreaseProviderChecks } from "./application/services/card-increase-provider-checks.js";
import { CardIncreaseRefund } from "./application/services/card-increase-refund.js";
import { IncreaseOrderLabels } from "./application/services/increase-order-labels.js";
import { OrderRevisionRecording } from "./application/services/order-revision-recording.js";
import { CardIncreaseLease } from "./domain/ports/card-increase-lease.js";
import { CardIncreaseSweepReader } from "./domain/ports/card-increase-sweep.reader.js";
import { CardIncreaseWake } from "./domain/ports/card-increase-wake.js";
import { CardIncreaseSweepController } from "./http/card-increase-sweep.controller.js";
import { PrismaCardIncreaseLease } from "./infrastructure/prisma-card-increase-lease.js";
import { PrismaCardIncreaseSweepReader } from "./infrastructure/prisma-card-increase-sweep.reader.js";

/**
 * Les providers du lot S2.c (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`) : appliquer
 * une hausse payée (l'exécuteur à bail, son réveil, son balayage, « Relancer »),
 * l'abandon au délai, les deux abonnés qui rendent le complément, et le projet
 * vu par l'annulation de la commande (R9). L'écriture de M1
 * (`OrderRevisionRecording`) est partagée avec `ReviseOrderHandler`.
 */
export const CARD_INCREASE_PROVIDERS: readonly Provider[] = [
  OrderRevisionRecording,
  IncreaseOrderLabels,
  CardIncreaseBell,
  CardIncreaseOutcomes,
  CardIncreaseProviderChecks,
  CardIncreaseRefund,
  CardIncreaseCancellation,
  ApplyCardIncreaseHandler,
  SweepCardIncreasesHandler,
  ExpireCardIncreasesHandler,
  RelaunchCardIncreaseHandler,
  RefundLateComplement,
  RefundRefusedIncrease,
  { provide: CardIncreaseWake, useClass: BusCardIncreaseWake },
  { provide: CardIncreaseDispatch, useClass: BusCardIncreaseDispatch },
  { provide: CardIncreaseLease, useClass: PrismaCardIncreaseLease },
  { provide: CardIncreaseSweepReader, useClass: PrismaCardIncreaseSweepReader },
];

export const CARD_INCREASE_CONTROLLERS: readonly Type[] = [CardIncreaseSweepController];
