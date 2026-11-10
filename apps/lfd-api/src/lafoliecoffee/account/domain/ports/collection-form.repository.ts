import type { CollectionFormHistory } from "../entities/collection-form-history.js";

/**
 * Port d'**écriture** des formes de prélèvement : il prend et rend l'agrégat
 * {@link CollectionFormHistory}, jamais une période isolée.
 */
export abstract class CollectionFormRepository {
  /** Toutes les périodes de cette société — un historique vide si elle n'en a aucune. */
  abstract load(companyId: string): Promise<CollectionFormHistory>;

  /** Les neuves s'ajoutent, les fermées prennent leur fin. Rien ne s'efface. */
  abstract save(history: CollectionFormHistory): Promise<void>;
}
