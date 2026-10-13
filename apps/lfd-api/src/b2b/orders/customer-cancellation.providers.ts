import type { Provider, Type } from "@nestjs/common";

import { CancelGuestOrderHandler } from "./application/commands/cancel-guest-order.handler.js";
import { CancelOrderByCustomerHandler } from "./application/commands/cancel-order-by-customer.handler.js";
import { RingCustomerCancellation } from "./application/handlers/ring-customer-cancellation.handler.js";
import { GetGuestOrderCancellationHandler } from "./application/queries/get-guest-order-cancellation.handler.js";
import { GetOrderCancellabilityHandler } from "./application/queries/get-order-cancellability.handler.js";
import { CancellationWall } from "./application/services/cancellation-wall.js";
import { CustomerCancellability } from "./application/services/customer-cancellability.js";
import { CustomerCancellationPolicyGate } from "./application/services/customer-cancellation-policy.js";
import { CustomerOrderCancellation } from "./application/services/customer-order-cancellation.js";
import { GuestCancellationLinkResolver } from "./application/services/guest-cancellation-link.resolver.js";
import { OrderManageLink } from "./application/services/order-manage-link.js";
import { CancellationLinkSigner } from "./domain/ports/cancellation-link-signer.js";
import { CancellingMemberReader } from "./domain/ports/cancelling-member.reader.js";
import { CustomerCancellationSubjectReader } from "./domain/ports/customer-cancellation-subject.reader.js";
import { GuestOrderCancellationController } from "./http/guest-order-cancellation.controller.js";
import { HmacCancellationLinkSigner } from "./infrastructure/hmac-cancellation-link.signer.js";
import { PrismaCancellingMemberReader } from "./infrastructure/prisma-cancelling-member.reader.js";
import { PrismaCustomerCancellationSubjectReader } from "./infrastructure/prisma-customer-cancellation-subject.reader.js";

/**
 * Les providers du lot C6 (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`) :
 * l'annulation par le client connecté et par l'invité, leur mur, le réglage
 * appliqué, l'annulabilité affichée, le lien signé et la cloche à l'équipe.
 * À part du module, qui dépasse déjà la taille d'un fichier. Le noyau
 * (`OrderCancellation`) est déclaré avec le geste staff ; le réglage vient de
 * `OrderOpeningModule`.
 */
export const CUSTOMER_CANCELLATION_PROVIDERS: readonly Provider[] = [
  { provide: CustomerCancellationSubjectReader, useClass: PrismaCustomerCancellationSubjectReader },
  { provide: CancellingMemberReader, useClass: PrismaCancellingMemberReader },
  { provide: CancellationLinkSigner, useClass: HmacCancellationLinkSigner },
  CancellationWall,
  CustomerCancellationPolicyGate,
  CustomerOrderCancellation,
  CustomerCancellability,
  GuestCancellationLinkResolver,
  OrderManageLink,
  CancelOrderByCustomerHandler,
  CancelGuestOrderHandler,
  GetOrderCancellabilityHandler,
  GetGuestOrderCancellationHandler,
  RingCustomerCancellation,
];

export const CUSTOMER_CANCELLATION_CONTROLLERS: readonly Type[] = [
  GuestOrderCancellationController,
];
