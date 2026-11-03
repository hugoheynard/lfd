import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Le verrou du stock demandé hors transaction : relâché aussitôt, il ne
 * protégerait rien. Une erreur du contrat du port (`ShelfStockLock` : « pris
 * DANS l'unité de travail de l'appelant »), rangée avec lui depuis le
 * 2026-11-03 — elle vivait dans l'adaptateur.
 */
export class ShelfStockLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "resupply.shelf_stock.lock_outside_transaction",
      "Le verrou du stock de la vitrine exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}
