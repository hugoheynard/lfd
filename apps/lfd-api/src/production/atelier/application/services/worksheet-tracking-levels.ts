import type { ProductionTrackingLevel } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { ServiceDay } from "../../../day/index.js";
import type { GroupingSource } from "../../../shared/print/index.js";
import { GroupingSourceReading } from "../../../workstations/index.js";
import {
  type DayTrackingLevels,
  isUniform,
  lineLevelOf,
} from "../../domain/services/tracking-levels.js";

/** Les niveaux de chaque ligne, et s'ils ont pu être lus en entier. */
export interface WorksheetTrackingLevels {
  /**
   * Le niveau de SORTIE de la ligne : celui du poste qui la finit, sinon celui
   * du fournil. C'est lui qui règle la fournée — automatique en toujours vert,
   * déclarée par « Fait » sinon.
   */
  readonly outputLevelOf: (sku: string) => ProductionTrackingLevel;
  /**
   * Le niveau de l'ÉTAPE que ce poste fait de la ligne : celui du poste dans
   * la journée, sinon celui du fournil ; détaillé si les postes sont
   * illisibles. Il ne dit pas si le poste EST une étape de la ligne : la
   * carte courante le dit, et c'est au geste de l'étape de le vérifier — le
   * lire ici forcerait la lecture des postes quand tous sont au niveau du
   * fournil.
   */
  readonly stepLevelOf: (sku: string, workstationId: string) => ProductionTrackingLevel;
  /** `false` : les postes n'ont pas pu être lus — les lignes sont servies en détaillé. */
  readonly known: boolean;
}

/**
 * **Les niveaux de suivi de chaque ligne de la fiche** (
 * `documentation/fournil/les-niveaux-de-suivi.md` ; plan
 * `documentation/fournil/plan-produit-sur-plusieurs-postes.md`, § 2.8) : le
 * niveau de sortie, celui du poste qui finit la ligne, et le niveau de chaque
 * étape, celui du poste qui la fait. Le niveau d'un poste est celui que la
 * journée a figé ; les postes d'une ligne se lisent sur la carte courante.
 * Servis par ligne, ils valent quel que soit le groupe où la ligne est rangée.
 *
 * Il ne lit le poste des articles que s'il le faut : tous les postes au
 * niveau du fournil, chaque ligne l'est ; en mode prod, le rangement les a
 * déjà lus. Des postes illisibles servent les lignes en **détaillé** — le
 * niveau où rien n'est automatique et où tout geste reste possible — et la
 * fiche n'est pas gardée.
 */
@Injectable()
export class WorksheetTrackingLevelsReading {
  constructor(private readonly grouping: GroupingSourceReading) {}

  async read(
    day: ServiceDay,
    levels: DayTrackingLevels,
    skus: readonly string[],
    source: GroupingSource,
  ): Promise<WorksheetTrackingLevels> {
    if (isUniform(levels)) {
      return { outputLevelOf: () => levels.house, stepLevelOf: () => levels.house, known: true };
    }
    const bySku = await this.grouping.workstationOfSkus(
      skus,
      `Fiche d'atelier du ${day.value}`,
      source,
    );
    if (bySku === null) {
      return { outputLevelOf: () => "detailed", stepLevelOf: () => "detailed", known: false };
    }
    return {
      outputLevelOf: (sku) =>
        lineLevelOf(levels, bySku.get(sku)?.find((station) => station.finishes)?.workstationId),
      stepLevelOf: (_sku, workstationId) => lineLevelOf(levels, workstationId),
      known: true,
    };
  }
}
