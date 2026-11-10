/**
 * **Réveiller l'exécuteur d'une hausse payée** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.5, §2.6) —
 * appelé APRÈS validation, quand un complément vient d'être encaissé.
 *
 * Le point d'appel est posé au lot S2.a ; l'exécuteur à bail (`ApplyCardIncrease`)
 * arrive au lot S2.c, qui branchera ici son adaptateur. D'ici là,
 * `NoCardIncreaseWake` ne fait rien, et rien n'est perdu : le projet reste
 * `ready` en base, et le balayage de S2.c le reprendra.
 */
export abstract class CardIncreaseWake {
  /** Ne lève pas : un réveil manqué attend le balayage. */
  abstract wake(proposalId: string): Promise<void>;
}
