import { BusinessError } from "../../platform/shared/errors/app-error.js";

/**
 * Les refus du scénario par étapes. Lus par qui démontre, sans le code sous
 * les yeux : chacun nomme le cas et le geste de sortie.
 */

/** Les commandes du jour ne sont pas (ou plus toutes) là : rien à avancer. */
export class ScenarioNotPlacedError extends BusinessError {
  constructor(day: string) {
    super(
      "dev.scenario.not_placed",
      `Le scénario du ${day} n'est pas posé (ou une de ses commandes a disparu) : ` +
        "« Remettre à l'état de base » le repose.",
    );
  }
}

/** Plan §2 : `next` à la dernière étape (5) est refusé, nommément. */
export class ScenarioCompleteError extends BusinessError {
  constructor(day: string) {
    super(
      "dev.scenario.complete",
      `Le scénario du ${day} est déjà à sa dernière étape — tournées chargées, prêtes à partir. ` +
        "Le départ se fait à l'écran des tournées ; « Remettre à l'état de base » pour recommencer.",
    );
  }
}
