import type { WriteTicket } from "../../../../journal/pim-journal.js";
import type { Product, ProductSnapshot } from "../entities/product.js";
import type { VariantNutritionSnapshot, VariantSnapshot } from "../entities/variant.js";

/**
 * **Le read model du catalogue** — ce que les canaux (Shopify, plateforme
 * B2B) consomment. C'est l'instantané de l'agrégat, pas l'agrégat : une
 * projection n'a rien à muter, et lui tendre des méthodes serait l'inviter à
 * le faire. Les noms restent ceux que les canaux importent déjà.
 */
export type ProductRecord = ProductSnapshot;
export type VariantRecord = VariantSnapshot;
export type VariantNutritionView = VariantNutritionSnapshot;
export type { ProductKind, ProductStatus } from "../entities/product.js";

/**
 * Port d'écriture : il rend et reprend l'**agrégat**.
 *
 * Il ne porte plus une méthode par mutation (`rename`, `setStatus`,
 * `setVariantPrice`…). Ces méthodes obligeaient le dépôt à savoir ce que
 * chaque verbe change — et le tarif d'une déclinaison s'écrivait par son id
 * seul, sans que rien ne rappelle à quel produit elle appartient.
 */
export abstract class ProductRepository {
  abstract findById(id: string): Promise<Product | null>;
  abstract listAll(): Promise<Product[]>;
  /**
   * Écrit le produit, sa déclinaison par défaut **et** la réservation des deux
   * références, en une transaction : l'invariant 2 n'est jamais faux, même une
   * fraction de seconde.
   */
  abstract add(product: Product, ticket: WriteTicket): Promise<void>;
  abstract save(product: Product, ticket: WriteTicket): Promise<void>;
}
