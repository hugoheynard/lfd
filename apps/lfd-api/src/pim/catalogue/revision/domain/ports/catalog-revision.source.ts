import type { RevisionItemInput } from "../revision.js";

/**
 * D'où vient la matière d'une révision.
 *
 * Un port À PART du `CatalogueReader`, et pour une raison de fond : celui-ci
 * répond aux questions des CANAUX (« que puis-je vendre ? »), en projetant ce
 * qu'ils comprennent. Une révision, elle, photographie la fiche — éditorial et
 * visuels compris — parce qu'un canal doit pouvoir être autosuffisant.
 *
 * Les deux liraient les mêmes tables, ils ne posent pas la même question. Les
 * fondre obligerait le lecteur des canaux à charger un éditorial qu'aucun d'eux
 * ne lit aujourd'hui.
 */
export abstract class CatalogRevisionSource {
  /**
   * Tout ce qui est photographiable, héritages **résolus**.
   *
   * Les fiches archivées sont dehors : elles ne sont plus au catalogue. Les
   * brouillons y sont, avec leur `status` — une ancre doit pouvoir montrer
   * qu'une fiche est passée en ligne entre deux versions.
   */
  abstract snapshotItems(): Promise<readonly RevisionItemInput[]>;
}
