import { CATALOGUE_AUDIENCES, type CatalogueAudience } from "@lfd/pim-contracts";

import { InvalidAudienceError } from "../errors/audience-errors.js";

/**
 * **À qui l'on vend** : professionnels, particuliers, les deux (C2 du plan
 * `plan-catalogue-synchronise-par-audience.md`) — ou personne : `resupply`,
 * l'article se commande seulement en réassort des boutiques
 * (`plan-articles-de-reassort.md`).
 */
export type Audience = CatalogueAudience;

/**
 * Valide une clientèle reçue — d'une requête ou d'une ligne relue.
 *
 * @throws {InvalidAudienceError} la valeur n'est pas l'une des quatre.
 */
export function audience(raw: string): Audience {
  const found = CATALOGUE_AUDIENCES.find((candidate) => candidate === raw);
  if (found === undefined) {
    throw new InvalidAudienceError(raw);
  }
  return found;
}

/**
 * La clientèle **réelle**, sur trois niveaux
 * (`plan-audience-par-declinaison.md`, A1) : celle de la déclinaison si elle
 * en a posé une, sinon celle de sa fiche, sinon celle de sa famille. Pour la
 * fiche elle-même (l'en-tête, son défaut), `variantAudience` vaut `null` : le
 * défaut n'a jamais d'audience propre.
 *
 * Écrite une fois, ici : c'est elle qui décidera ce qui se vend à qui, et deux
 * copies finiraient par ne plus répondre la même chose.
 */
export function effectiveAudience(
  variantAudience: Audience | null,
  productAudience: Audience | null,
  categoryAudience: Audience,
): Audience {
  return variantAudience ?? productAudience ?? categoryAudience;
}

/** Une clientèle à qui l'on vend, une seule : ni `both`, ni le réassort. */
export type BuyerAudience = Exclude<Audience, "both" | "resupply">;

/**
 * Les clientèles qu'une audience **sert**, une par une — `both` en sert deux,
 * `resupply` aucune. C'est la liste à juger pour savoir si chacune peut être
 * facturée : un article de réassort n'a aucun prix à exiger.
 */
export function servedAudiences(value: Audience): readonly BuyerAudience[] {
  if (value === "both") {
    return ["pro", "public"];
  }
  return value === "resupply" ? [] : [value];
}
