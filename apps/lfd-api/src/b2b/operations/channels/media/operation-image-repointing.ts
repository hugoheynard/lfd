import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";

/** Une image du fonds remplacée par une autre, signée de qui et quand. */
export interface OperationImageChange {
  readonly from: string;
  readonly to: string;
  /** La fiche INTERNE du staff — l'opération l'inscrit comme dernier auteur. */
  readonly staffId: string;
  readonly at: Date;
}

/**
 * **Repointer une image dans les opérations du commerce** — le pendant
 * d'écriture de `OperationMediaUsage`, publié par le même canal. Deux
 * ports et pas un (ISP) : compter sert au ramassage et au retrait, qui n'ont
 * rien à faire d'un port qui réécrit les opérations.
 *
 * 🔴 Il passe par l'AGRÉGAT (charger, `repointImage`, sauver — CLAUDE.md
 * §3.1), jamais par un `UPDATE` de colonne : une opération archivée ne change
 * plus, et c'est l'agrégat qui le dit.
 *
 * Exige le laissez-passer du journal : c'est la médiathèque qui trace le
 * remplacement (`media_asset.replaced`) ; l'opération n'inscrit pas de fait
 * en plus, le geste n'est pas le sien.
 */
export abstract class OperationImageRepointing {
  /**
   * Remplace `from` par `to` dans les opérations non archivées, dans la
   * transaction ambiante. Rend combien d'opérations ont changé.
   */
  abstract repoint(change: OperationImageChange, ticket: WriteTicket): Promise<number>;
}
