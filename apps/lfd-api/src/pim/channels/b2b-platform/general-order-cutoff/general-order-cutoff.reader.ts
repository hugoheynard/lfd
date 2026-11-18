/**
 * Le port `GeneralOrderCutoffReader` tel que le commerce l'implémente.
 *
 * Il est DÉCLARÉ par la limite de commande
 * (`order-time-limitation/domain/ports/general-order-cutoff.reader.ts`), qui
 * montre la règle générale en tête de sa page ; ce fichier n'en est que la
 * porte publiée — un bloc extérieur n'atteint le référentiel que par
 * `channels/` (`lint:context-boundaries`), et la classe, donc le jeton
 * d'injection, est la même des deux côtés.
 */
export {
  GeneralOrderCutoffReader,
  type GeneralOrderCutoff,
} from "../../../order-time-limitation/domain/ports/general-order-cutoff.reader.js";
