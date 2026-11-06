import { Logger } from "@nestjs/common";

import { TechnicalError } from "../shared/errors/app-error.js";
import { DEFAULT_NETWORK_CALL_MODE, type NetworkCallMode } from "./network-call-mode.js";
import { currentTransactionOrigin, isInsideTransaction } from "./transaction.store.js";

/**
 * Un appel réseau sortant est parti **dans une transaction** de base.
 *
 * Une transaction tient des verrous et une connexion du pool le temps de
 * l'appel : un tiers lent fige des lignes que d'autres attendent, et un
 * `ROLLBACK` après l'appel laisse chez le tiers un effet que la base renie.
 */
export class NetworkCallInsideTransactionError extends TechnicalError {
  constructor(readonly what: string) {
    super(
      "network_call_inside_transaction",
      `L'appel sortant « ${what} » part dans une transaction de base ouverte. ` +
        "Le faire AVANT d'ouvrir la transaction, ou APRÈS sa validation par l'outbox " +
        "(documentation/todos/todo-reseau-hors-transaction.md).",
    );
  }
}

/** Une violation constatée : ce qui a été appelé, d'où, et où la transaction s'est ouverte. */
export interface NetworkCallViolation {
  readonly what: string;
  readonly stack: string;
  /** `undefined` tant que personne n'a demandé le relevé (`traceTransactionOrigins`). */
  readonly transactionOrigin: string | undefined;
}

export type NetworkCallViolationListener = (violation: NetworkCallViolation) => void;

const logger = new Logger("NetworkOutsideTransaction");
let mode: NetworkCallMode = DEFAULT_NETWORK_CALL_MODE;
const listeners = new Set<NetworkCallViolationListener>();

/**
 * Règle la garde pour le processus. Appelé une fois au démarrage
 * (`DatabaseModule`, depuis `AppConfig`) : la garde est une fonction libre, et
 * c'est ce qui permet de la poser en tête de chaque adaptateur sans toucher
 * à leurs constructeurs.
 */
export function configureNetworkCallGuard(next: NetworkCallMode): void {
  mode = next;
}

/** Écoute les violations (la mesure du harnais e2e). Rend de quoi se désabonner. */
export function onNetworkCallViolation(listener: NetworkCallViolationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * **À appeler en tête de toute méthode qui touche le réseau**, avant même le
 * test « non configuré » : un appel qui ne part pas en dev partirait en
 * production, et c'est là qu'il faut le voir.
 *
 * `what` nomme l'appel pour le lecteur du journal (`Stripe.paymentIntents.create`).
 */
export function assertOutsideTransaction(what: string): void {
  if (mode === "off" || !isInsideTransaction()) {
    return;
  }
  const here: { stack?: string } = {};
  Error.captureStackTrace(here, assertOutsideTransaction);
  const violation: NetworkCallViolation = {
    what,
    stack: here.stack ?? "",
    transactionOrigin: currentTransactionOrigin(),
  };
  for (const listener of listeners) {
    listener(violation);
  }
  if (mode === "enforce") {
    throw new NetworkCallInsideTransactionError(what);
  }
  logger.warn({ event: "network_call_inside_transaction", what, stack: violation.stack });
}
