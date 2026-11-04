import type { ShelfChangeScope } from "../shelf-change-scope.js";

/**
 * **Le signal « un rayon a changé »** — appelé par tout écrivain d'un modèle
 * que le rayon lit (`plan-cache-du-catalogue.md`, C1 ; la porte
 * `lint:shelf-writes` le tient).
 *
 * L'implémentation diffère elle-même jusqu'après la validation
 * (`AfterCommit`) : l'appelant ne peut pas oublier « après le commit », et une
 * purge montée dans la transaction rouvrirait la course qu'elle doit fermer —
 * un rayon recalculé sur l'état d'avant, puis gardé.
 *
 * Synchrone et sans échec : un signal perdu est rattrapé par la durée de vie
 * des rayons (30 s au public, 5 minutes au plus au pro depuis le 2026-11-04),
 * une écriture refusée pour une purge ne le serait par rien.
 */
export abstract class ShelfChanges {
  abstract changed(scope: ShelfChangeScope): void;
}
