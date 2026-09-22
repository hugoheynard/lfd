import type { WriteTicket } from "../../../../journal/pim-journal.js";
import type { AllergenDeclaration } from "../value-objects/nutrition-declaration.js";

/**
 * Écriture des **allergènes** d'une déclinaison — et rien d'autre.
 *
 * Un port par table, et c'est tout l'objet du chantier (plan
 * `plan-separer-allergenes-et-nutrition.md`, §6a) : enregistrer les valeurs
 * nutritionnelles ne peut alors PAS toucher une déclaration de sécurité, parce
 * qu'il n'y a pas de colonne à remplir. Une écriture peut encore en écraser une
 * autre ; elle ne peut plus en détruire une qu'elle ne visait pas.
 *
 * Il ne revient pas dans `ProductRepository.save()` : celui-ci a douze
 * appelants — publier, archiver, renommer, régler un taux — et lui confier la
 * fiche étendrait le *lost update* à douze gestes, sur de la donnée d'étiquette.
 */
export abstract class VariantAllergensRepository {
  abstract save(
    variantId: string,
    declaration: AllergenDeclaration,
    ticket: WriteTicket,
  ): Promise<void>;
}
