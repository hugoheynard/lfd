import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Une ligne relue en base porte l'instant d'un geste sans son auteur entier
 * (ou une levée d'alerte sans sa raison). Les CHECK de la base tiennent ces
 * colonnes ensemble ; arriver ici dit qu'une écriture les a contournés.
 * Refusé plutôt que relu avec un auteur vide : un nom inventé à la lecture
 * s'afficherait « par  » au comptoir et se recopierait à la prochaine
 * écriture (audit du réassort, 2026-11-02).
 */
export class UnreadableResupplyRowError extends TechnicalError {
  constructor(
    readonly table: string,
    readonly rowId: string,
    readonly gesture: string,
  ) {
    super(
      "resupply.row.unreadable",
      `La ligne ${rowId} de ${table} porte l'instant du geste « ${gesture} » sans son auteur complet : rien n'a été modifié. Signalez-le, la ligne est à réparer en base.`,
    );
  }
}
