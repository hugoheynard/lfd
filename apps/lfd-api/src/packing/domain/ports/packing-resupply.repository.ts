import type { PackingResupply } from "../entities/packing-resupply.js";

/**
 * **La fiche de réassort, en écriture** (réassort, lot R3b). `lock` la charge
 * sous `SELECT … FOR UPDATE`, dans l'unité de travail de l'appelant ; `save`
 * écrit la saisie et la clôture depuis l'agrégat.
 */
export abstract class PackingResupplyRepository {
  /** `null` : la fiche n'est pas au colisage pour cette journée. */
  abstract lock(serviceDay: string, resupplyId: string): Promise<PackingResupply | null>;

  abstract save(sheet: PackingResupply): Promise<void>;
}
