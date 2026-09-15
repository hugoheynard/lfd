/**
 * Brouillons de saisie et contrôles **de forme** partagés par les formulaires de
 * société des deux frontends B2B (création client, création admin, édition). La
 * validité réelle (clé SIRET, unicité, e-mail) appartient au backend — on ne la
 * duplique pas ici, on ne vérifie que la présence et le gabarit.
 */

import type { AssignableRole } from '@lfd/contracts';

/** Identité légale saisissable d'une société. */
export interface CompanyIdentityDraft {
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  /**
   * Le SIREN de l'entreprise — saisi à part (décision de Hugo, 2026-09-15),
   * parce qu'un SIRET dont le préfixe n'est pas un SIREN valide existe.
   */
  readonly siren: string;
  readonly vatNumber: string;
}

/**
 * Coordonnées saisissables d'un interlocuteur.
 *
 * `role` est ce que la personne fait pour la société — vide tant qu'il n'a pas
 * été choisi. `owner` n'y figure jamais : le détenteur n'est pas attribué, il
 * est constaté. Le champ reste présent pour le détenteur (que le formulaire
 * n'affiche pas), qui garde simplement une valeur vide : le brouillon est le
 * même objet des deux côtés, et deux brouillons divergeraient au premier champ
 * ajouté d'un seul.
 */
export interface CompanyContactDraft {
  readonly firstName: string;
  readonly lastName: string;
  readonly fonction: string;
  readonly email: string;
  readonly phone: string;
  readonly role: AssignableRole | '';
}

/** Brouillon d'identité vide (pour ouvrir un formulaire de création). */
export const EMPTY_COMPANY_IDENTITY_DRAFT: CompanyIdentityDraft = {
  raisonSociale: '',
  enseigne: '',
  formeJuridique: '',
  siret: '',
  siren: '',
  vatNumber: '',
};

/** Longueur d'un SIREN : les neuf premiers chiffres d'un SIRET. */
const SIREN_LENGTH = 9;

/** `000000000` passe la clé de Luhn et ne désigne personne : le serveur le refuse aussi. */
const NULL_SIREN = '000000000';

/**
 * Clé de Luhn sur une suite de chiffres. Un chiffre sur deux, en partant de la
 * droite, est doublé ; la somme doit être un multiple de dix.
 */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Le SIREN que ces chiffres forment, espaces retirés — ou `null` s'ils n'en
 * forment pas un : neuf chiffres, clé de Luhn, jamais `000000000`.
 *
 * ⚠️ Ce n'est pas une seconde validation : le serveur fait foi et refuse ce
 * qu'il refuse. L'écran s'en sert pour une seule chose — PROPOSER le SIREN
 * qu'un SIRET porte, sans jamais proposer un préfixe que le serveur rejetterait.
 */
export function sirenOf(value: string): string | null {
  const digits = value.replace(/\s/gu, '');
  const shaped = digits.length === SIREN_LENGTH && /^\d+$/u.test(digits);
  return shaped && digits !== NULL_SIREN && passesLuhn(digits) ? digits : null;
}

/**
 * Le SIREN que porte un SIRET : ses neuf premiers chiffres, **seulement** s'ils
 * forment un SIREN valide. La clé du SIRET ne garantit pas celle de son préfixe
 * (plan mentions obligatoires du mandat, §8 #1) : `81245678900021` est un SIRET
 * valide dont le préfixe n'est pas un SIREN.
 */
export function sirenPrefixOf(siret: string): string | null {
  const digits = siret.replace(/\s/gu, '');
  return /^\d{14}$/u.test(digits) ? sirenOf(digits.slice(0, SIREN_LENGTH)) : null;
}

/**
 * Le SIREN à montrer quand le SIRET passe de `previousSiret` à `nextSiret`.
 *
 * Il **suit** le SIRET tant qu'il n'a pas été saisi à la main — vide, ou égal à
 * ce que l'ancien SIRET proposait : il prend alors le préfixe du nouveau s'il
 * est valide, et se vide s'il ne l'est plus (une proposition qui ne tient plus
 * ne reste pas affichée comme une saisie). Un SIREN tapé par quelqu'un ne se
 * réécrit jamais : si les deux se contredisent, c'est le serveur qui le dit.
 */
export function sirenFollowingSiret(
  siren: string,
  previousSiret: string,
  nextSiret: string,
): string {
  const typed = siren.replace(/\s/gu, '');
  const proposed = sirenPrefixOf(previousSiret);
  if (typed !== '' && typed !== proposed) {
    return siren;
  }
  return sirenPrefixOf(nextSiret) ?? '';
}

/** Le brouillon avec ce SIRET, et le SIREN qui le suit ({@link sirenFollowingSiret}). */
export function withSiret(draft: CompanyIdentityDraft, siret: string): CompanyIdentityDraft {
  return { ...draft, siret, siren: sirenFollowingSiret(draft.siren, draft.siret, siret) };
}

/** Brouillon de contact vide. */
export const EMPTY_COMPANY_CONTACT_DRAFT: CompanyContactDraft = {
  firstName: '',
  lastName: '',
  fonction: '',
  email: '',
  phone: '',
  role: '',
};

/**
 * De quoi **ouvrir** une société : son **enseigne**, et rien d'autre.
 *
 * L'enseigne, pas la raison sociale : c'est le nom sur la devanture, celui que
 * le commercial a en tête et que le client donne au téléphone. La raison
 * sociale est une donnée d'identification officielle — elle arrive avec le
 * SIRET, quand les papiers sont sur la table.
 *
 * Les exiger à l'ouverture, ce serait renvoyer dans sa voiture le commercial
 * qui crée le compte devant son client, et le compte ne serait jamais ouvert.
 * Ils se complètent ensuite, et l'activation les exige (côté serveur).
 */
export function isCompanyIdentityOpenable(draft: CompanyIdentityDraft): boolean {
  return draft.enseigne.trim() !== '';
}

/** Identité **complète** : champs requis présents + SIRET à 14 chiffres. */
export function isCompanyIdentityValid(draft: CompanyIdentityDraft): boolean {
  return (
    draft.raisonSociale.trim() !== '' &&
    draft.formeJuridique.trim() !== '' &&
    draft.siret.replace(/\s/gu, '').length === 14
  );
}

/**
 * Contrôle de forme d'un interlocuteur : **l'adresse seule** est exigée.
 *
 * C'est par elle qu'on joint quelqu'un et qu'il recevrait un accès ; le nom est
 * un confort. L'exiger bloquerait une saisie faite au téléphone pour une donnée
 * qui se complète en deux clics plus tard.
 */
export function isCompanyContactValid(draft: CompanyContactDraft): boolean {
  return draft.email.trim() !== '';
}

/**
 * Un contact **du carnet** : l'adresse, et ce que la personne fait.
 *
 * Le rôle manque au contrôle du détenteur ({@link isCompanyContactValid}) parce
 * que le sien est constaté, pas choisi.
 */
export function isAdditionalContactValid(draft: CompanyContactDraft): boolean {
  return isCompanyContactValid(draft) && draft.role !== '';
}
