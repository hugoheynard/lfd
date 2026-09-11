import type { DayDemand } from "../services/production-forecast.js";
import type { ServiceRange } from "../value-objects/service-range.value-object.js";

/**
 * **Les comptes à produire déjà ARRÊTÉS**, sur une plage de jours.
 *
 * ## Pourquoi un port de lecture à part, et pas `ProductionDayRepository`
 *
 * Le dépôt prend et rend l'AGRÉGAT — c'est ce qui l'empêche de dériver en CRUD,
 * et c'est la règle du §3.1. Un prévisionnel de sept jours chargerait alors sept
 * journées entières, commandes, lignes, colisages compris, pour n'en lire que le
 * compte : la moitié de l'écran en objets qu'on jette.
 *
 * C'est exactement la séparation que le §4 demande — les écritures mutent, les
 * lectures ne mutent jamais — et l'ISP appliqué à la lettre : un consommateur ne
 * dépend que de ce qu'il appelle. Ce port ne sait pas ouvrir, ni clore, ni
 * coliser. Il répond à une question, et une seule.
 *
 * ⚠️ Une journée **absente** du résultat n'est pas une journée vide : c'est une
 * journée **non arrêtée**, dont la demande se lit chez le commerce. Les deux
 * sources ne se distinguent nulle part ailleurs que dans cette absence — la
 * matrice en fait sa règle d'arbitrage.
 */
export abstract class ProductionPlanReader {
  abstract arrestedBetween(range: ServiceRange): Promise<readonly DayDemand[]>;
}
