import { fractionByBasisPoints, fromCents, roundToCents } from "@lfd/money";

import { htFromTtc, htMillicentsOf, ttcCentsFromHtMillicents } from "@lfd/money";
import { z } from "zod";

/**
 * **Les règles comptables du référentiel** — ce que la maison décide une fois,
 * et qui vaut pour tout le catalogue.
 *
 * Elles n'en portent qu'une aujourd'hui : le rapport entre le prix public et le
 * prix professionnel. C'est délibérément un réglage **global** et non un champ
 * par famille — la décision « le pro paie 10 % de moins » se prend au niveau de
 * la maison, pas rayon par rayon. Le jour où un rayon devra y déroger, la
 * dérogation s'ajoutera SOUS ce réglage, comme une famille déroge à un taux ;
 * elle ne le remplacera pas.
 */

/**
 * Le plafond du rapport : **100 %**, soit 10 000 points de base.
 *
 * Un prix professionnel au-dessus du prix public n'est pas une politique
 * commerciale, c'est une faute de frappe — et une faute de frappe ici
 * surfacture silencieusement tous les professionnels, sur tout le catalogue.
 * La borne est donc dans le contrat, pas seulement à l'écran.
 */
export const MAX_RATIO_BP = 10_000;

// ── Les deux méthodes de prix professionnel ────────────────────────────────

/**
 * **Comment on fixe le prix professionnel d'une déclinaison sans saisie.**
 *
 * - **`entered`** (lot P, puis lot S de `plan-catalogue-synchronise-par-audience.md`,
 *   Hugo, 2026-10-15 et 2026-10-16) : le prix pro HT est **saisi** par
 *   déclinaison, et c'est la seule source. Une déclinaison sans saisie n'est
 *   pas vendue aux professionnels. C'est la méthode d'une base vierge.
 * - **`ratio_ttc`** : le repli d'origine — la remise s'applique au prix public
 *   TTC. Son code reste (Hugo : « n'efface pas le code ») et une base qui y est
 *   encore la garde jusqu'au geste « Passer au prix saisi » ; l'écran ne
 *   l'offre plus.
 *
 * Dans les deux cas, **la saisie prime** : la méthode ne décide que du repli.
 *
 * ⚠️ Recopiée dans `@lfd/contracts` (`journal-facts/referential-settings.ts`),
 * qui valide le fait du changement de méthode : les deux listes vont ensemble.
 */
export const PRO_PRICE_METHODS = ["ratio_ttc", "entered"] as const;
export type ProPriceMethod = (typeof PRO_PRICE_METHODS)[number];

/**
 * **Ce que vaut une base où rien n'a jamais été réglé** (lot S, contradiction
 * de `vitruve` du 2026-10-16) : `entered`, sans rapport.
 *
 * Avant le lot S, l'absence de règles valait `null` et **tout** s'arrêtait,
 * saisies comprises : le push refusait, les faits ne vendaient rien,
 * « Activer » refusait. Un rapport n'est plus qu'une suggestion ; son absence
 * ne coûte que la suggestion, jamais une saisie.
 *
 * Une base qui a une ligne garde sa méthode : aucun déploiement ne change une
 * méthode en place.
 */
export const UNSET_PRO_PRICE_POLICY: ProPricePolicy = { method: "entered", ratioBp: null };

/**
 * En **points de base entiers**, jamais en pourcentage flottant.
 *
 * `0.9` n'est pas représentable en binaire, et un rapport qui dérive au
 * quinzième chiffre finit par produire deux prix différents pour le même
 * article selon qui l'a calculé. L'entier ne dérive pas — et c'est déjà l'unité
 * de `PriceRule.value`, côté plateforme.
 *
 * On stocke le rapport (9 000 = 90 %), pas la remise (−10 %). C'est ce qui
 * MULTIPLIE : le dériver d'une remise imposerait une soustraction à chaque
 * lecture, donc un endroit de plus où se tromper de sens.
 */
export const proPriceRatioPayloadSchema = z.object({
  ratioBp: z.number().int().positive().max(MAX_RATIO_BP),
});
export type ProPriceRatioPayload = z.infer<typeof proPriceRatioPayloadSchema>;

/**
 * **Choisir la méthode appliquée.**
 *
 * Un seul champ. Depuis le lot S, l'écran ne s'en sert plus que pour « Passer
 * au prix saisi » (`entered`) ; la route accepte toujours `ratio_ttc` — le
 * code n'est pas effacé.
 */
export const proPriceMethodPayloadSchema = z.object({
  method: z.enum(PRO_PRICE_METHODS),
});
export type ProPriceMethodPayload = z.infer<typeof proPriceMethodPayloadSchema>;

/**
 * Ce que l'écran lit.
 *
 * `ratioBp` à `null` = **jamais réglé**, et c'est une information à part entière :
 * l'écran doit dire « à régler » plutôt qu'afficher 100 %, qui affirmerait
 * « le pro paie le prix public » — une phrase que personne n'a prononcée. Le
 * référentiel a déjà retiré un défaut de ce genre (`DEFAULT_FOOD_VAT_RATE`) :
 * nommer un défaut qui n'existe pas est pire que ne rien nommer.
 */
export interface AccountingRulesView {
  readonly ratioBp: number | null;
  /**
   * La méthode **appliquée** — celle dont le push se sert.
   *
   * `entered` quand rien n'a jamais été réglé ({@link UNSET_PRO_PRICE_POLICY},
   * lot S) : une base vierge n'a aucun prix à préserver. Une base qui a une
   * ligne rend la sienne.
   */
  readonly method: ProPriceMethod;
  /** ISO-8601, ou `null` si rien n'a jamais été réglé. */
  readonly updatedAt: string | null;
}

/**
 * Le prix professionnel TTC, dérivé d'un prix public TTC — tous deux en
 * centimes entiers.
 *
 * **Ici et nulle part ailleurs.** Le serveur en a besoin pour tarifer, l'écran
 * pour montrer ce que le réglage produit. Deux implémentations finiraient par
 * diverger d'un centime d'arrondi, et cette divergence-là ne se voit qu'en
 * comparant deux factures.
 *
 * **Un seul arrondi, en fin de calcul.** Le rationnel exact de `@lfd/money`
 * traverse la multiplication sans jamais retomber sur un centime, et
 * `roundToCents` tranche à la sortie — au plus proche, la moitié s'éloignant de
 * zéro, l'arrondi commercial. Arrondir vers le bas offrirait un demi-centime au
 * client sur chaque ligne, ce qui n'est une remise que personne n'a décidée.
 *
 * Rien ne valide `ratioBp` ici : c'est le rôle du VO côté serveur, et le
 * contrat ne doit pas porter deux fois la même garde. Un appelant qui passe un
 * rapport hors bornes obtient un nombre hors bornes — l'écriture, elle, est
 * murée en base.
 */
export function proPriceFromPublic(publicTtcCents: number, ratioBp: number): number {
  return roundToCents(fractionByBasisPoints(fromCents(publicTtcCents), ratioBp));
}

/**
 * Le **hors taxe professionnel** d'un prix public TTC : la chaîne entière.
 *
 * `null` sans taux — le hors taxe n'est alors pas dérivable, et inventer un
 * taux ferait facturer un montant que personne n'a décidé.
 *
 * ## L'ordre des arrondis, et pourquoi il n'est pas celui qu'on croit
 *
 * On pourrait garder le rationnel exact d'un bout à l'autre et n'arrondir qu'à
 * la toute fin. On ne le fait pas, et c'est délibéré : **le prix pro TTC est un
 * prix**, pas une étape de calcul. C'est le montant qu'un professionnel voit et
 * paie, il s'arrête donc au centime — et le hors taxe se déduit de CE
 * montant-là.
 *
 * L'autre ordre ferait diverger d'un centime les deux nombres que l'écran
 * affiche l'un sous l'autre : le HT annoncé, re-taxé, ne redonnerait pas le TTC
 * annoncé. Un client qui recompte trouverait le désaccord avant nous.
 *
 * C'est la même règle qu'ailleurs — « le TTC fait foi, le HT en est la
 * conséquence » — appliquée deux fois de suite.
 */
export function proHtFromPublic(
  publicTtcCents: number,
  ratioBp: number,
  ratePercent: number | null,
): number | null {
  if (ratePercent === null) {
    return null;
  }
  return htFromTtc(proPriceFromPublic(publicTtcCents, ratioBp), ratePercent);
}

/**
 * Le réglage complet, tel qu'il s'applique — méthode ET matériaux.
 *
 * Un objet plutôt que deux arguments : la méthode et le rapport vont ensemble,
 * et une future méthode paramétrée ajoutera son champ ici sans toucher aux
 * signatures qui la traversent.
 */
export interface ProPricePolicy {
  readonly method: ProPriceMethod;
  /**
   * Le rapport, `null` s'il n'a jamais été posé (lot S). Il ne sert de repli
   * que sous `ratio_ttc` ; sous `entered`, il ne nourrit que la suggestion.
   * `ratio_ttc` sans rapport ne tarife rien : `proPriceOf` rend `null`.
   */
  readonly ratioBp: number | null;
}

/**
 * Un prix professionnel, dans les **deux** unités que la chaîne demande.
 *
 * Les deux ensemble et jamais l'un sans l'autre : c'est aujourd'hui le TTC qui
 * est calculé et le HT qui s'en déduit, mais une méthode pourrait faire
 * l'inverse. Rendre un seul des deux obligerait chaque appelant à savoir lequel
 * est l'original — c'est-à-dire à reconstruire la branche ici.
 */
export interface ProPrice {
  /**
   * Ce qu'un professionnel paie, taxe comprise.
   *
   * ⚠️ Sous `entered`, c'est un **affichage** : le HT saisi fait foi, et
   * personne ne redérive un HT de ce TTC (il perdrait les décimales saisies).
   */
  readonly ttcCents: number;
  /** Ce qui part sur le fil et que multiplie une quantité (10⁻⁵ €). */
  readonly htMillicents: number;
}

/**
 * **Le prix professionnel — l'unique porte, quelle que soit la méthode.**
 *
 * Un seul point d'entrée parce que la branche est une décision d'argent : la
 * dupliquer chez ses appelants garantirait qu'un écran finisse par montrer une
 * méthode pendant que le fil en pousse une autre. Ses appelants, vérifié le
 * 2026-10-16 (lot S) : `projection.ts` et `catalog-facts.ts` (le fil),
 * `variant-completeness.ts` (la complétude), le pré-remplissage
 * (`pro-price-prefill.ts`, deux appels — retiré le 2026-10-27, lot R2),
 * l'écran des règles
 * (`accounting-rules-page.ts`, deux appels), la fiche (`product-form-store.ts`)
 * et la suggestion de la fiche (`pro-price-entry.ts`, `proPriceSuggestionOf`).
 *
 * `null` **sans taux d'article** : le hors taxe n'en est pas dérivable sous
 * `ratio_ttc`, et le taux sert de toute façon à FACTURER. Un article sans taux
 * est donc écarté du canal (`variant_sans_taux`) — inventer un taux facturerait
 * un montant que personne n'a décidé.
 *
 * Sans saisie, `null` aussi sous `entered` (un prix pro absent n'est pas le
 * prix public, ni zéro), et sous `ratio_ttc` sans rapport posé (lot S : rien
 * n'invente un rapport).
 */
export function proPriceOf(
  publicTtcCents: number,
  policy: ProPricePolicy,
  articleVatPercent: number | null,
  enteredHtMillicents: number | null,
): ProPrice | null {
  if (articleVatPercent === null) {
    return null;
  }
  // 🔴 **La saisie prime, quelle que soit la méthode** (Hugo, 2026-10-15 :
  // « si un prix pro HT a été marqué dans le champ, c'est lui qui doit
  // nourrir le tableau »). La méthode ne décide plus que du REPLI d'une
  // déclinaison sans saisie : le ratio sous `ratio_ttc`, rien sous `entered`.
  if (enteredHtMillicents !== null) {
    return enteredProPrice(enteredHtMillicents, articleVatPercent);
  }
  if (policy.method === "entered" || policy.ratioBp === null) {
    return null;
  }
  return ratioTtcProPrice(publicTtcCents, policy.ratioBp, articleVatPercent);
}

/**
 * `ratio_ttc` — **inchangé** depuis avant le lot P. Le TTC pro est un PRIX :
 * il s'arrête au centime, et le hors taxe se déduit de CE montant-là (cf.
 * `proHtFromPublic`).
 */
function ratioTtcProPrice(
  publicTtcCents: number,
  ratioBp: number,
  articleVatPercent: number,
): ProPrice | null {
  const ttcCents = proPriceFromPublic(publicTtcCents, ratioBp);
  const htMillicents = htMillicentsOf(ttcCents, articleVatPercent);
  return htMillicents === null ? null : { ttcCents, htMillicents };
}

/**
 * `entered` — **le HT saisi fait foi**, au millicentime ; le TTC en est la
 * conséquence, arrondi au centime par la même règle que `htMillicentsOf`, à
 * l'envers.
 */
function enteredProPrice(
  enteredHtMillicents: number | null,
  articleVatPercent: number,
): ProPrice | null {
  if (enteredHtMillicents === null) {
    return null;
  }
  return {
    ttcCents: ttcCentsFromHtMillicents(enteredHtMillicents, articleVatPercent),
    htMillicents: enteredHtMillicents,
  };
}
