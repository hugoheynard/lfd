import type { Provider, Type } from "@nestjs/common";

import { ReviewOrderHandler } from "./application/commands/review-order.handler.js";
import { WithdrawOrderReviewHandler } from "./application/commands/withdraw-order-review.handler.js";
import {
  CurrentOrderReviewsReader,
  OrderReviewsReader,
} from "./domain/ports/order-reviews.reader.js";
import { OrderReviewsRepository } from "./domain/ports/order-reviews.repository.js";
import { AdminOrderReviewController } from "./http/admin-order-review.controller.js";
import {
  PrismaCurrentOrderReviewsReader,
  PrismaOrderReviewsReader,
} from "./infrastructure/prisma-order-reviews.reader.js";
import { PrismaOrderReviewsRepository } from "./infrastructure/prisma-order-reviews.repository.js";

/**
 * Le visa des commandes (plan du visa des commandes) : viser, retirer, et
 * les lectures du détail et de la liste. À part du module, qui dépasse déjà
 * la taille d'un fichier.
 */
export const ORDER_REVIEW_PROVIDERS: readonly Provider[] = [
  ReviewOrderHandler,
  WithdrawOrderReviewHandler,
  { provide: OrderReviewsRepository, useClass: PrismaOrderReviewsRepository },
  { provide: OrderReviewsReader, useClass: PrismaOrderReviewsReader },
  { provide: CurrentOrderReviewsReader, useClass: PrismaCurrentOrderReviewsReader },
];

export const ORDER_REVIEW_CONTROLLERS: readonly Type[] = [AdminOrderReviewController];
