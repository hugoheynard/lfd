/**
 * **La fournée automatique d'une ligne en toujours vert** (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.7) — envoyée par le
 * tour du cron, une par ligne. Sans auteur : c'est le système qui déclare.
 */
export class RunAlwaysGreenLineCommand {
  constructor(
    readonly serviceDay: string,
    readonly sku: string,
  ) {}
}

export type { AlwaysGreenLineOutcome } from "../../domain/services/always-green.js";
