import type { RecordActivityInput } from "../activity-event.js";

/**
 * Port du **journal d'événements**. L'application dépend de cette abstraction ;
 * l'adaptateur append-only vit en `infrastructure/`.
 *
 * **Deux garanties, et le choix appartient à l'émetteur** — parce que « une
 * trace manquée » ne coûte pas la même chose selon ce qu'elle décrit.
 */
export abstract class ActivityRecorder {
  /**
   * **Best-effort et idempotent** : n'échoue JAMAIS vers l'appelant. Pour les
   * faits analytiques (une reco affichée, une étape franchie) — les perdre
   * dégrade une statistique, casser la transaction métier dégraderait le
   * service.
   */
  abstract record(input: RecordActivityInput): Promise<void>;

  /**
   * **Bloquant** : une panne d'écriture remonte, et annule donc la transaction
   * qui l'englobe. Pour ce qui doit être TRAÇABLE — une modification de fiche
   * dont on veut pouvoir dire qui l'a faite. Là, une trace manquée en silence
   * est pire que l'échec : elle laisse croire que rien n'a changé.
   *
   * Reste idempotent : un rejeu de la même émission est un no-op, pas une
   * erreur.
   */
  abstract recordOrFail(input: RecordActivityInput): Promise<void>;
}
