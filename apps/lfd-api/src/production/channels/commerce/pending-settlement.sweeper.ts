import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * **Le balayage des règlements restés en l'air**, demandé par la clôture AVANT
 * de compter (plan `documentation/order/plan-abandon-du-reglement.md`, Q1, B1).
 *
 * ## Pourquoi un port synchrone, et pas un abonné
 *
 * La clôture refuse une journée vide (`ProductionDayEmptyError`). Or une
 * commande dont la carte n'est pas encaissée ne produit plus (D2) : sans
 * balayage préalable, une journée où personne n'a payé ne se clôt jamais, et
 * ses règlements en vol ne meurent jamais — le blocage circulaire du §4. Un
 * abonné à `ProductionDayClosedEvent` arriverait APRÈS le compte, c'est-à-dire
 * trop tard : le fournil doit attendre que le commerce ait tranché.
 *
 * ## Ce que le fournil en sait
 *
 * Rien, et c'est voulu : il demande « tranche ce qui n'est pas payé pour ce
 * jour-là », le commerce seul sait ce qu'un règlement veut dire. Déclaré ici,
 * implémenté par `b2b/orders`, relié par `appBootstrap` — le sens de
 * `DayOrdersReader` : `production → b2b` reste interdit.
 *
 * ## Le contrat que la clôture attend
 *
 * - **Ne lève pas pour une panne du prestataire de paiement** : une panne
 *   Stripe n'arrête pas le fournil (B1). Seule une panne de la base remonte.
 * - **Idempotent** : appelé à CHAQUE clôture, réannonce comprise (S4) ; un
 *   second passage ne trouve plus rien à trancher, sauf ce qui a été passé
 *   entre-temps.
 */
export abstract class PendingSettlementSweeper {
  abstract sweep(day: ServiceDay): Promise<void>;
}
