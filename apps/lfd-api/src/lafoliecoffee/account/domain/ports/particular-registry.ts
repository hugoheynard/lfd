import type { TakenContact } from "../errors/particular-errors.js";
import type { ParticularIdentity } from "../value-objects/particular-identity.js";

/** La fiche existante qui répond déjà à une identité saisie. */
export interface ParticularHolder {
  readonly id: string;
  readonly firstName: string;
  readonly taken: TakenContact;
}

/**
 * Port d'**écriture** : inscrire au comptoir une fiche invitée (sans identité
 * de connexion), et dire d'abord si la personne existe déjà.
 *
 * Le refus d'un doublon est applicatif : `users.email` et `users.phone` n'ont
 * pas d'unicité en base et ne peuvent pas en avoir (deux lignes, deux
 * histoires). Deux comptoirs qui inscrivent la même personne à la même seconde
 * font deux fiches — assumé, le doublon se voit à la recherche suivante.
 */
export abstract class ParticularRegistry {
  /**
   * Le particulier dont l'adresse (casse et blancs ignorés) ou le téléphone
   * (clé de rapprochement) est déjà celui de `identity`, ou `null`.
   */
  abstract holderOf(identity: ParticularIdentity): Promise<ParticularHolder | null>;

  /** Inscrit une fiche invitée neuve et rend son identifiant. */
  abstract register(identity: ParticularIdentity, registeredBy: string): Promise<string>;
}
