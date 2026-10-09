import type { ConstitutionAuthor } from "../../domain/entities/collection-batch.js";

/**
 * Constitue les lots de prélèvement d'une entité pour le dernier cycle clos —
 * un lot par schéma qui a des lignes (plan `lot-de-prelevement-fige.md`). Par la comptabilité (le bouton), ou par l'automatisme une fois par
 * cycle (plan `prelevement-automatique.md`, PA3) : la MÊME commande,
 * seul l'auteur change.
 *
 * Rend les identifiants des lots créés — vide si la constitution n'a fait
 * qu'écarter des commandes.
 */
export class ConstituteCollectionBatchesCommand {
  constructor(
    readonly legalEntityId: string,
    /** Une fiche staff LOCALE (jamais un `sub`), ou `system`. */
    readonly author: ConstitutionAuthor,
  ) {}
}
