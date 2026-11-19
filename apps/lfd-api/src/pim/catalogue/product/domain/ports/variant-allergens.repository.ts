import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
import type { Product } from "../entities/product.js";

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
 *
 * Il prend pourtant l'**agrégat** : ce qu'il écrit est la déclaration que la
 * fiche porte (`Product.ownAllergenDeclaration`), après que son verbe l'a
 * jugée (`declareAllergens` refuse une déclinaison d'une autre fiche). Il
 * n'écrit que cette moitié, et seulement pour cette déclinaison.
 *
 * @throws {VariantNotFoundError} la déclinaison n'est pas sous cette fiche.
 * @throws {TechnicalError} la déclinaison n'a rien déclaré — l'appelant
 *   persiste une déclaration qu'il n'a pas posée.
 */
export abstract class VariantAllergensRepository {
  abstract save(product: Product, variantId: string, ticket: WriteTicket): Promise<void>;
}
