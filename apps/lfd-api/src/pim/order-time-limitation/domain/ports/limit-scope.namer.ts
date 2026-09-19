import type { LimitScope } from "../value-objects/limit-scope.js";

/**
 * **Comment s'appelle la cible d'une limite** — la famille par son nom,
 * l'article par son SKU —, pour figer la portée en mots dans le fait du
 * journal (lot B du plan des phrases, D6, 2026-09-19).
 *
 * Un port de LECTURE à part du dépôt (ISP) : `SetOrderTimeLimitHandler` n'a
 * besoin que de ce nom-là, et le dépôt n'a pas à grossir d'une lecture pour
 * lui. Le retrait, lui, le trouve déjà dans la vue qu'il relit (`scopeLabel`).
 */
export abstract class LimitScopeNamer {
  /** Le nom de la cible ; `null` pour la portée globale, ou une cible disparue. */
  abstract nameOf(scope: LimitScope): Promise<string | null>;
}
