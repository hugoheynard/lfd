import type { BillingAddressPayload } from '@lfd/contracts';

import { postalIssueOf, coordinatesIssueOf, type PostalAddress } from '../address/address.model';

/**
 * La part **postale** d'un brouillon d'adresse — le socle que les trois natures
 * (facturation, livraison, retrait) partagent, et la seule qu'une facturation
 * possède en entier.
 *
 * Les noms sont ceux de nos contrats (français) ; `PostalAddress` est l'API
 * neutre du fragment de saisie. Le pont entre les deux se traverse ici, une
 * fois — c'est le seul endroit qui doit savoir que `ligne1` et `line1`
 * désignent la même chose.
 *
 * La **note** et le **point GPS** en font partie, bien qu'aucun ne parte dans
 * une charge de facturation : tous deux décrivent le LIEU, pas la livraison.
 * Un digicode reste vrai quel que soit celui qui vient. Ce sont les charges
 * qui décident de les emporter ou non, pas le brouillon de les ignorer.
 *
 * Tout est chaîne (`''` = vide), coordonnées comprises : un formulaire n'a pas
 * d'état « pas encore de champ », et un nombre à moitié tapé n'est pas un nombre.
 */
export interface PostalDraft {
  /** Nom d'usage — « Siège », « Boutique Bastille ». Vide = anonyme. */
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  /** Consignes sur le lieu — ce qu'une ligne d'adresse ne peut pas dire. */
  readonly note: string;
  readonly gpsLat: string;
  readonly gpsLng: string;
}

/** Brouillon postal vierge. `pays` prérempli : c'est le cas courant. */
export const EMPTY_POSTAL_DRAFT: PostalDraft = {
  label: '',
  ligne1: '',
  ligne2: '',
  codePostal: '',
  ville: '',
  pays: 'France',
  note: '',
  gpsLat: '',
  gpsLng: '',
};

/** Une vue portant les six champs postaux — facturation, livraison ou retrait. */
export interface FrenchPostal {
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
}

/** Préremplit la part postale depuis une adresse existante. */
export function postalDraftFrom(view: FrenchPostal): PostalDraft {
  return {
    ...EMPTY_POSTAL_DRAFT,
    label: view.label,
    ligne1: view.ligne1,
    ligne2: view.ligne2,
    codePostal: view.codePostal,
    ville: view.ville,
    pays: view.pays,
  };
}

/**
 * Vue → adresse postale neutre, pour l'**affichage**. Ni note ni point : une
 * vue de facturation n'en porte pas, et une carte n'en montre pas.
 */
export function postalFrom(view: FrenchPostal): PostalAddress {
  return {
    label: view.label,
    line1: view.ligne1,
    line2: view.ligne2,
    postalCode: view.codePostal,
    city: view.ville,
    country: view.pays,
    latitude: '',
    longitude: '',
    note: '',
  };
}

/** Brouillon → adresse postale neutre, pour la **saisie** : tout y est. */
export function toPostal(draft: PostalDraft): PostalAddress {
  return {
    ...postalFrom(draft),
    latitude: draft.gpsLat,
    longitude: draft.gpsLng,
    note: draft.note,
  };
}

/**
 * Réinjecte ce que le fragment de saisie a rendu, **sans toucher au reste**.
 * Générique par nécessité : un brouillon de livraison qui traverse cette
 * fonction doit ressortir avec ses créneaux et son contact intacts.
 */
export function withPostal<T extends PostalDraft>(draft: T, postal: PostalAddress): T {
  return {
    ...draft,
    label: postal.label,
    ligne1: postal.line1,
    ligne2: postal.line2,
    codePostal: postal.postalCode,
    ville: postal.city,
    pays: postal.country,
    gpsLat: postal.latitude,
    gpsLng: postal.longitude,
    note: postal.note,
  };
}

/** Ce qui manque pour que l'adresse soit postable. Vide = complète. */
export function postalIssue(draft: PostalDraft): string {
  return postalIssueOf(toPostal(draft));
}

/** Les deux coordonnées, ou aucune, et dans les bornes. Vide = valide. */
export function gpsIssueOf(draft: PostalDraft): string {
  return coordinatesIssueOf(toPostal(draft));
}

/**
 * Part postale → charge de facturation.
 *
 * Ni note ni point GPS : le contrat de facturation n'en a pas, et une facture
 * ne se livre pas. Ce n'est pas une perte, c'est la frontière.
 */
export function toBillingPayload(draft: PostalDraft): BillingAddressPayload {
  return {
    label: draft.label.trim(),
    ligne1: draft.ligne1.trim(),
    ligne2: draft.ligne2.trim(),
    codePostal: draft.codePostal.trim(),
    ville: draft.ville.trim(),
    pays: draft.pays.trim(),
  };
}
