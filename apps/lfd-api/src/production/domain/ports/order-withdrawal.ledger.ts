import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Le registre des retraits** — port d'ÉCRITURE, en ajout seul (plan
 * `documentation/order/plan-annulation-de-commande.md`, C3.4 ter).
 *
 * Une écriture nue, et c'est le cas que le §3.1 du `CLAUDE.md` autorise : une
 * ligne par commande retirée, jamais modifiée. La règle qui pourrait la
 * refuser — « déjà inscrite » — est tranchée par le guichet sous le verrou de
 * la journée, juste avant ; celle qui la LIT est dans l'agrégat.
 */
export abstract class OrderWithdrawalLedger {
  /**
   * Écrit le retrait si la commande n'en a pas ; sinon ne fait rien. Un
   * second retrait (double clic, rejeu de transaction) n'est pas une erreur.
   */
  abstract record(day: ServiceDay, orderId: string, at: Date): Promise<void>;
}
