/**
 * Range une route d'écriture dans la case « **risque assumé** » : un rejeu
 * peut refaire le geste, et quelqu'un l'a décidé (plan
 * `documentation/ops/l-idempotence-des-ecritures.md`, § 7).
 *
 * `reason` dit le risque réel et pourquoi on le prend ; `decision` dit qui l'a
 * décidé et quand (« décidé par Hugo le 2026-11-12 »). `pnpm gate
 * write-idempotence` refuse l'un des deux vide, et affiche la liste de ces
 * routes à chaque exécution : un risque assumé reste visible.
 *
 * Sans effet à l'exécution, comme `@Idempotent`.
 */
export function AcceptedReplay(_reason: string, _decision: string): MethodDecorator {
  return () => undefined;
}
