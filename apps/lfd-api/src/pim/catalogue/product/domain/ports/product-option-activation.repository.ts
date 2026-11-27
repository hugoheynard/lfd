import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
import type { ProductOptionActivations } from "../entities/product-option-activations.js";

/** Port d'écriture des groupes d'options d'une fiche : il prend et rend l'agrégat. */
export abstract class ProductOptionActivationRepository {
  /** Les activations de la fiche, retirées comprises ; un agrégat vide si elle n'en a aucune. */
  abstract load(productId: string): Promise<ProductOptionActivations>;
  abstract save(activations: ProductOptionActivations, ticket: WriteTicket): Promise<void>;
}
