import type { ServiceDay } from "../../../day/index.js";
import type { LineStep, LineStepKey, LineStepState } from "../entities/line-step.js";

/**
 * **Le port d'écriture des étapes** (
 * `documentation/fournil/plan-produit-sur-plusieurs-postes.md`, § 2.6) : il
 * prend et rend l'agrégat. Les gestes le relisent sous le verrou de la
 * journée, le mutent par une méthode métier, puis le sauvent.
 */
export abstract class LineStepRepository {
  /** L'étape, ou `null` : aucun geste encore sur elle. */
  abstract load(key: LineStepKey): Promise<LineStep | null>;

  /** Écrit l'état entier, sous sa clé (insertion ou remplacement de la version lue). */
  abstract save(step: LineStep): Promise<void>;
}

/**
 * **Les étapes d'une journée** — port de LECTURE (ISP) : la fiche en tire ce
 * qui attend, la Supervision les rouges, le tour toujours vert ce qui est
 * déjà touché. Aucun geste ne passe par lui.
 */
export abstract class DayLineStepsReader {
  abstract allOf(day: ServiceDay): Promise<readonly LineStepState[]>;
}

/**
 * **Cocher d'office des étapes en toujours vert** — port d'écriture du seul
 * tour automatique (ISP). Une insertion qui ignore le conflit sur la clé :
 * une étape déjà touchée — faite, en rouge ou décochée par quelqu'un — n'est
 * jamais réécrite par la machine.
 */
export abstract class AutomaticStepChecks {
  /** @returns le nombre d'étapes réellement cochées. */
  abstract checkIfAbsent(keys: readonly LineStepKey[], at: Date, author: string): Promise<number>;
}
