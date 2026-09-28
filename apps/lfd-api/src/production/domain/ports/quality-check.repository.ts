import type { QualityCheck } from "../entities/quality-check.js";

/**
 * **Le port d'écriture du contrôle qualité** — il prend et rend l'AGRÉGAT
 * (plan `plan-controle-qualite.md`, D2).
 *
 * Pas de `update` : un contrôle est une ligne jamais réécrite. Lever un blocage,
 * c'est `save` un nouveau contrôle. `load` sert l'idempotence (D8) — rejouer un
 * `id` connu rend ce qui est déjà écrit.
 */
export abstract class QualityCheckRepository {
  abstract load(id: string): Promise<QualityCheck | null>;

  /**
   * Écrit le contrôle ET ses lignes de photos, ensemble.
   *
   * @throws {QualityCheckWriteRaceError} l'`id`, ou un des dépôts, vient d'être
   *   pris par un enregistrement simultané — la base a arbitré.
   */
  abstract save(check: QualityCheck): Promise<void>;
}
