import type { NamedRef } from "../events/journal-names.js";

/** Un suivi du tarif entre un sous-compte et son principal, noms du moment. */
export interface PricingFollowEntry {
  readonly child: NamedRef;
  readonly parent: NamedRef;
  readonly validFrom: Date;
}

/**
 * **Le journal des prix, vu des gestes de la hiérarchie** (`plan-sous-comptes.md`,
 * S3, T21).
 *
 * Suivre ou cesser de suivre le tarif du principal est une décision de prix :
 * elle s'inscrit au journal des prix, sur le compte tarifaire des DEUX
 * sociétés, et sa copie au journal général tient lieu de
 * `company.parent_followed` pour l'aspect `pricing`.
 *
 * Déclaré ici et implémenté par la tarification, relié à la racine de
 * composition : `account` ne connaît pas l'écrivain des actes de prix. Appelé
 * DANS la transaction du geste — la période et ses actes tombent ensemble.
 * La table datée `company_follows` reste la seule source de la relecture.
 */
export abstract class PricingFollowJournal {
  /** La période vient de s'ouvrir, à `validFrom`. */
  abstract followStarted(entry: PricingFollowEntry): Promise<void>;

  /** La période ouverte à `validFrom` vient de se fermer, à `validTo`. */
  abstract followEnded(entry: PricingFollowEntry & { readonly validTo: Date }): Promise<void>;
}
