import type { OrderCutoffRule } from "../../domain/services/latest-order-cutoff.js";

/**
 * **Les heures limites de commande**, telles que le commerce les tient (plan
 * `documentation/fournil/arret-du-plan.md`).
 *
 * Depuis le 2026-10-21, l'heure limite générale DÉCLENCHE l'arrêt du plan :
 * le plan d'une journée s'arrête tout seul à la fin de son rattrapage, et un
 * arrêt à la main plus tôt est refusé (`limites-de-commande/plan-une-seule-heure.md`
 * §5). Le fournil a besoin de la connaître, elle vit au commerce. Il DÉCLARE
 * donc ce port — `production → b2b` est interdit —, le commerce l'implémente,
 * la racine de composition les relie. Toujours en vigueur : l'interrupteur
 * qui l'éteignait est retiré le même jour.
 *
 * Depuis le 2026-10-21, au plus UNE règle : la générale (les règles par
 * point × jour sont retirées, `limites-de-commande/schema-des-reglages.md`
 * §4, point 4). La forme en liste reste, la production n'a pas à changer. Les
 * DÉROGATIONS (un client, un jour) n'y sont pas : elles ne sont pas un réglage
 * qu'une heure d'arrêt peut suivre.
 */
export abstract class OrderCutoffRulesReader {
  abstract rules(): Promise<readonly OrderCutoffRule[]>;
}
