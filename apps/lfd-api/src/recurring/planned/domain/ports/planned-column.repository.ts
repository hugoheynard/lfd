import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import type { PlannedColumn } from "../entities/planned-column.js";

/** Ce qui désigne une colonne vivante : la société (le mur, et le site : un site est une société), le jour et le créneau. */
export interface PlannedColumnSlot {
  readonly companyId: string;
  readonly serviceDay: IsoDate;
  readonly windowStart: string | null;
  readonly windowEnd: string;
}

/** Ce que le balayage lit : la fenêtre des prochains jours, et l'instant du passage. */
export interface PlannedColumnSweep {
  readonly lastDay: IsoDate;
  readonly now: Date;
}

/**
 * Port d'**écriture** des colonnes planifiées. Séparé de la lecture (ISP).
 *
 * Il prend et rend l'agrégat. L'écriture est **conditionnée à la version
 * lue** : deux onglets qui écrivent la même colonne ne s'écrasent pas, le
 * second est refusé.
 */
export abstract class PlannedColumnRepository {
  /** La colonne, murée par sa société — retirée comprise ; `null` si absente ou d'une autre société. */
  abstract load(companyId: string, columnId: string): Promise<PlannedColumn | null>;

  /** La colonne VIVANTE (non retirée) qui occupe ce créneau, s'il y en a une. */
  abstract loadSlot(slot: PlannedColumnSlot): Promise<PlannedColumn | null>;

  /**
   * Les colonnes en BROUILLON que le balayage lit, toutes sociétés confondues :
   * celles servies au plus tard `lastDay` (index partiel
   * `planned_columns_draft_idx`), et celles dont l'instant de conversion rangé
   * est atteint à `now`, quel que soit leur jour (index partiel
   * `planned_columns_draft_converts_at_idx`) — un article qui ferme plus de
   * deux jours avant le jour servi. Par jour servi puis instant de conversion
   * croissants, au plus `limit`. La machine n'a pas de mur : elle passe
   * chaque colonne sous le mur de son acheteur, rejoué par la passation.
   */
  abstract draftsToSweep(sweep: PlannedColumnSweep, limit: number): Promise<PlannedColumn[]>;

  /**
   * Écrit la colonne (insérée si neuve) et rend sa nouvelle version.
   *
   * @throws {PlannedColumnVersionConflictError} écrite ailleurs depuis la lecture.
   * @throws {PlannedWindowTakenError} une autre colonne vivante occupe le créneau.
   */
  abstract save(day: PlannedColumn, at: Date): Promise<number>;
}
