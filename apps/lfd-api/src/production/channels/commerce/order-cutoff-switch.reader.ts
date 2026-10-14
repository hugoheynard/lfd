/**
 * **L'heure limite générale est-elle active au commerce ?** — port que le
 * fournil DÉCLARE et que le commerce implémente (plan
 * `documentation/commandes/plan-reglages-commandes.md`, §8.1, B2, lot O3).
 *
 * Désactivée, `OrderCutoffRulesReader` ne rend plus aucune règle : l'heure
 * d'arrêt n'est plus bornée, et c'est voulu — l'arrêt du plan est alors la
 * limite. La page Production › Réglages doit le DIRE plutôt que « aucune heure
 * limite n'est réglée » : les deux absences ne veulent pas dire la même chose,
 * et seule la seconde rend le mode automatique hasardeux.
 *
 * Un port à part (ISP) : la règle d'arrêt (`ChangeProductionCloseSettings`) ne
 * lit que les règles, seule la page lit l'interrupteur.
 */
export abstract class OrderCutoffSwitchReader {
  abstract enabled(): Promise<boolean>;
}
