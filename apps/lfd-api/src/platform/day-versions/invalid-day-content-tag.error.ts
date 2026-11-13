import { TechnicalError } from "../shared/errors/app-error.js";

/**
 * Un écran a demandé un contenu de journée sous une étiquette impossible
 * (sujet mal nommé, sujet en double, numéro négatif ou non entier). Une
 * erreur de code, pas de donnée : l'écran n'est jamais servi depuis l'objet
 * avec une étiquette qui pourrait en confondre deux.
 */
export class InvalidDayContentTagError extends TechnicalError {
  constructor(detail: string) {
    super(
      "day_contents.invalid_tag",
      `Étiquette de contenu de journée impossible (${detail}) : l'écran n'a pas été servi. ` +
        "Corriger les sujets que l'écran passe à DayContents.",
    );
  }
}
