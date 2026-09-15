import {
  FEATURE_CATALOGUE,
  isExemptible,
  isFeatureLevel,
  mostOpenLevel,
  type FeatureKey,
  type FeatureLevel,
} from "@lfd/contracts";

/**
 * **Qui demande**, du point de vue de la résolution : une adresse, et le fait
 * qu'elle soit prouvée. `null` = personne de connecté.
 *
 * Délibérément PAS le `Principal` : la résolution n'a besoin que de ces deux
 * champs, et le `Principal` ne porte pas encore la preuve d'adresse (lot 2 du
 * plan `documentation/b2b/plan-inscription-pro-seule.md`).
 */
export type FeatureSubject = {
  readonly email: string;
  readonly emailProven: boolean;
} | null;

/**
 * La forme sous laquelle une adresse se cherche dans les exemptions : sans
 * espace, en minuscules — la normalisation d'`EmailAddress`, qui écrit la liste.
 */
export function normalizeEmailForLookup(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * L'adresse à chercher dans les exemptions, ou `null` quand il n'y a rien à
 * chercher.
 *
 * 🔴 Une adresse NON prouvée ne se cherche pas. Sans cette condition, n'importe
 * qui pourrait s'inscrire avec l'adresse d'un testeur qui n'a pas encore de
 * compte, et hériter de son exemption (plan §2.2).
 */
export function exemptionLookupEmail(subject: FeatureSubject): string | null {
  if (subject === null || !subject.emailProven) {
    return null;
  }
  const email = normalizeEmailForLookup(subject.email);
  return email === "" ? null : email;
}

/**
 * **La résolution**, dans l'ordre du plan :
 *
 * 1. adresse prouvée ET dans les exemptions → niveau le plus ouvert ;
 * 2. sinon dérogation en base, si elle est un niveau de la clé ;
 * 3. sinon défaut du code.
 *
 * 🔴 Une clé **non exemptible** (`customerMandate`) saute l'étape 1 même si
 * l'appelant dit « exempté » : c'est ici, et pas chez chaque appelant, que la
 * règle tient — une ligne d'exemption posée en base à la main n'ouvrirait
 * donc rien (plan `documentation/comptabilite/plan-mandat-client.md` §9 #2).
 *
 * Une dérogation dont la valeur n'est plus un niveau de la clé est **ignorée**,
 * jamais interprétée : deviner ce qu'un niveau disparu voulait dire ouvrirait ou
 * fermerait la vente sur une supposition.
 */
export function resolveFeatureLevel<Key extends FeatureKey>(
  key: Key,
  facts: { readonly exempt: boolean; readonly storedOverride: string | null },
): FeatureLevel<Key> {
  if (facts.exempt && isExemptible(key)) {
    return mostOpenLevel(key);
  }
  const stored = facts.storedOverride;
  if (stored !== null && isFeatureLevel(key, stored)) {
    return stored;
  }
  return FEATURE_CATALOGUE[key].defaultLevel;
}
