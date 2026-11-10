/**
 * **Réveiller l'exécuteur d'une hausse payée** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.4, §2.7.5) —
 * appelé APRÈS validation, quand un complément vient d'être encaissé.
 *
 * L'adaptateur (`BusCardIncreaseWake`, lot S2.c) lance l'exécuteur à bail
 * (`ApplyCardIncreaseHandler`) en tâche de fond. Un réveil perdu ne perd
 * rien : le projet reste `ready` en base, et le balayage le reprend.
 */
export abstract class CardIncreaseWake {
  /** Ne lève pas : un réveil manqué attend le balayage. */
  abstract wake(proposalId: string): Promise<void>;
}
