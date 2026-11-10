/**
 * **Les familles d'activité d'un pro**, regroupées depuis son code NAF
 * (`Company.nafCode`, résolu depuis le SIRET, vide tant qu'inconnu).
 *
 * 🟡 **Proposition du lot A1, à valider par Hugo (Q4 du plan des audiences).**
 * Le regroupement suit la nomenclature NAF rév. 2 :
 *
 * | Famille                | Codes                                                   |
 * | ---------------------- | ------------------------------------------------------- |
 * | Hôtellerie             | 55.xx — hôtels, hébergement touristique, campings       |
 * | Restauration           | 56.1x, 56.2x — restaurants, rapide, traiteurs, cantines |
 * | Café, bar              | 56.30Z — débits de boissons                             |
 * | Commerce alimentaire   | 47.11, 47.2x — magasins ; 10.71 — boulangeries         |
 * | Autre activité         | tout autre code renseigné                               |
 * | Activité non renseignée| code vide, ou commande pro sans société                 |
 *
 * Une table de préfixes, lue dans l'ordre : ajouter une famille est une ligne,
 * pas une branche.
 */
export const ACTIVITY_FAMILIES = [
  { key: "hospitality", label: "Hôtellerie" },
  { key: "restaurant", label: "Restauration" },
  { key: "cafe_bar", label: "Café, bar" },
  { key: "food_retail", label: "Commerce alimentaire" },
  { key: "other", label: "Autre activité" },
  { key: "unknown", label: "Activité non renseignée" },
] as const;
export type ActivityFamily = (typeof ACTIVITY_FAMILIES)[number]["key"];

/** Préfixe du code NAF sans point (`5610A` → `561`) → famille. Le plus long d'abord n'importe pas : aucun ne se recouvre. */
const NAF_PREFIXES: readonly { readonly prefix: string; readonly family: ActivityFamily }[] = [
  { prefix: "55", family: "hospitality" },
  { prefix: "561", family: "restaurant" },
  { prefix: "562", family: "restaurant" },
  { prefix: "5630", family: "cafe_bar" },
  { prefix: "4711", family: "food_retail" },
  { prefix: "472", family: "food_retail" },
  { prefix: "1071", family: "food_retail" },
];

/** La famille d'un code NAF tel que la base le porte (`56.10A`, `5610A`, ou vide). */
export function activityFamilyOf(nafCode: string): ActivityFamily {
  const normalized = nafCode.replace(/[\s.]/gu, "").toUpperCase();
  if (normalized === "") {
    return "unknown";
  }
  return NAF_PREFIXES.find((entry) => normalized.startsWith(entry.prefix))?.family ?? "other";
}
