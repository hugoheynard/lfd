import type { ServiceDay } from "../../../day/index.js";
import type { ProductionProblem, ProductionProblemState } from "../entities/production-problem.js";

/**
 * **Le port d'écriture des problèmes** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) : il prend et rend
 * l'agrégat. Le rouge et « traité » le relisent sous le verrou de la journée,
 * le mutent par une méthode métier, puis le sauvent.
 */
export abstract class ProductionProblemRepository {
  /** Le problème d'une ligne, ou `null` : la ligne n'a jamais eu de rouge. */
  abstract load(day: ServiceDay, sku: string): Promise<ProductionProblem | null>;

  /** Un problème par son identifiant, ou `null`. */
  abstract loadById(id: string): Promise<ProductionProblem | null>;

  /** Écrit l'état entier, sous son `id` (insertion ou remplacement). */
  abstract save(problem: ProductionProblem): Promise<void>;
}

/**
 * **Les problèmes ouverts d'une journée** — port de LECTURE, séparé (ISP) :
 * la Supervision les lit, aucun geste ne passe par lui.
 */
export abstract class OpenProductionProblemsReader {
  abstract openOf(day: ServiceDay): Promise<readonly ProductionProblemState[]>;
}

/**
 * **Les problèmes d'une journée, traités compris** — port de LECTURE (ISP) :
 * la fiche en tire le plafond de chaque ligne, qui survit au « traité », et
 * le problème encore ouvert. Aucun geste ne passe par lui.
 */
export abstract class DayProblemsReader {
  abstract allOf(day: ServiceDay): Promise<readonly ProductionProblemState[]>;
}
