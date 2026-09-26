import type { LoyaltyHolder } from "../value-objects/loyalty-holder.js";

/** Un titulaire trouvé, et son nom — `null` pour une personne sans nom au profil. */
export interface LoyaltyHolderDescription {
  readonly label: string | null;
}

/**
 * Le **nom** d'un titulaire, tel que le journal et l'écran le citent : la
 * raison sociale d'une société, le nom d'une personne — jamais son adresse
 * e-mail (règle du journal : aucune coordonnée).
 */
export abstract class LoyaltyHolderDirectory {
  /** `null` = aucun titulaire sous cet identifiant. */
  abstract describe(holder: LoyaltyHolder): Promise<LoyaltyHolderDescription | null>;
}
