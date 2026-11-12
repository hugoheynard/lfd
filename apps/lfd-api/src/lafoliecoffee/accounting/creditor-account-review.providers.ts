import type { Provider } from "@nestjs/common";

import { CancelPendingCreditorAccountHandler } from "./application/commands/cancel-pending-creditor-account.handler.js";
import { ConfirmCreditorAccountHandler } from "./application/commands/confirm-creditor-account.handler.js";
import { RingCreditorAccountReview } from "./application/handlers/ring-creditor-account-review.handler.js";

/**
 * Le compte de l'entité aux quatre yeux (plan
 * `le-paiement-par-virement.md`, T0) : confirmer, annuler, et la
 * cloche. Proposer reste `SetCreditorAccountHandler`, au module. À part du
 * module, qui dépasse déjà la taille d'un fichier.
 */
export const CREDITOR_ACCOUNT_REVIEW_PROVIDERS: readonly Provider[] = [
  ConfirmCreditorAccountHandler,
  CancelPendingCreditorAccountHandler,
  RingCreditorAccountReview,
];
