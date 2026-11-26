import type { InHouseRecap } from "../entities/in-house-recap.js";

/**
 * Le port d'écriture du récapitulatif : il prend et rend l'agrégat. `save`
 * écrit un récapitulatif neuf en entier. `saveRectification` écrit un
 * remplacement dans l'ordre que la base exige : l'ancien libère ses BL, le
 * rectificatif les couvre, puis l'ancien désigne le rectificatif.
 * `saveDocument` écrit la clé du PDF que `InHouseRecap.recordDocument` vient
 * de poser — seulement si aucune ne l'était.
 */
export abstract class InHouseRecapRepository {
  abstract load(recapId: string): Promise<InHouseRecap | null>;
  abstract save(recap: InHouseRecap): Promise<void>;
  abstract saveRectification(replaced: InHouseRecap, rectified: InHouseRecap): Promise<void>;
  abstract saveDocument(recap: InHouseRecap): Promise<void>;
}
