import type { RecordActivityInput } from "../activity-event.js";

/**
 * Port du **journal d'événements**. L'application dépend de cette abstraction ;
 * l'adaptateur append-only vit en `infrastructure/`.
 *
 * Contrat fort : `record` est **best-effort et idempotent** — il **n'échoue
 * JAMAIS vers l'appelant**. Un journal manqué (panne, doublon) ne doit jamais
 * casser la transaction métier qui l'a déclenché : le journal est une projection
 * analytique, pas la vérité transactionnelle.
 */
export abstract class ActivityRecorder {
  abstract record(input: RecordActivityInput): Promise<void>;
}
