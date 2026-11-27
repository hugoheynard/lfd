import type { ServiceRange } from "../../day/domain/value-objects/service-range.value-object.js";
import type { ExpectedItem } from "./expected-production.reader.js";

/** Ce que les brouillons du planificateur des pros pèsent une journée, par article. */
export interface ExpectedDayPlanned {
  /** `AAAA-MM-JJ`. */
  readonly day: string;
  readonly items: readonly ExpectedItem[];
}

/**
 * **« Qu'est-ce qui est planifié, mais pas encore commandé, sur ces
 * journées ? »** — la couche « planifié, non commandé » du prévisionnel
 * (`documentation/fournil/le-previsionnel.md`). Port que le fournil DÉCLARE
 * et que le commerce implémente ; le commerce le lit lui-même au bloc des
 * paniers par son canal. Le fournil ne lit jamais ce bloc.
 *
 * Un port à part d'{@link ExpectedProductionReader} (ISP) : un brouillon
 * n'est pas une demande. Il ne se fabrique qu'en devenant une commande, et
 * n'entre donc ni dans les totaux, ni dans l'arrêt du plan, ni dans le
 * dossier du jour — seul le prévisionnel le lit, pour le montrer à part.
 *
 * Un jour sans brouillon peut manquer.
 */
export abstract class ExpectedPlannedReader {
  abstract plannedBetween(range: ServiceRange): Promise<readonly ExpectedDayPlanned[]>;
}
