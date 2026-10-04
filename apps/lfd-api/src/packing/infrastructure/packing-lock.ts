import { currentTransaction } from "../../platform/database/transaction.store.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";

/** Un verrou demandé hors d'une unité de travail : un défaut de code, pas un refus. */
class PackingLockOutsideTransactionError extends TechnicalError {
  constructor(what: string) {
    super(
      "packing.lock.outside_transaction",
      `Le verrou ${what} a été demandé hors d'une unité de travail : il serait relâché aussitôt pris. Le geste n'a rien écrit ; signalez-le à l'équipe technique.`,
    );
  }
}

/**
 * Refuse un `SELECT … FOR UPDATE` hors transaction — il ne tiendrait rien.
 *
 * @throws {PackingLockOutsideTransactionError}
 */
export function assertInsideUnitOfWork(what: string): void {
  if (currentTransaction() === undefined) {
    throw new PackingLockOutsideTransactionError(what);
  }
}

/** La réserve posée dans la transaction est introuvable — un défaut, jamais un refus. */
export class PackingStockVanishedError extends TechnicalError {
  constructor(serviceDay: string, sku: string) {
    super(
      "packing.stock.vanished",
      `La réserve « ${sku} » du ${serviceDay} est introuvable juste après sa création : le geste n'a rien écrit. Signalez-le à l'équipe technique.`,
    );
  }
}
