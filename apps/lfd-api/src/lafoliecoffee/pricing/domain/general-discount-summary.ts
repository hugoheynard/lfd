import type { GeneralDiscount, GeneralDiscountRule } from "./entities/general-discount.js";
import { describePercent } from "./pricing-act-summary.js";

/**
 * **La remise générale, en mots, pour le journal tarifaire** : « remise
 * générale −30 %, 2 taux particuliers, sauf 1 famille et 3 articles », ou
 * « remise générale sur 2 familles seulement ».
 *
 * Les cibles sont COMPTÉES et non nommées : la phrase est figée au moment de
 * l'acte, et le domaine ne connaît que des identifiants. Le détail se lit sur
 * la mercuriale elle-même.
 */
export function describeGeneralDiscount(discount: GeneralDiscount | null): string {
  if (discount === null) {
    return "sans remise générale";
  }
  const rated = discount.rules.filter((rule) => rule.bp !== null);
  const excluded = discount.rules.filter((rule) => rule.bp === null);
  if (discount.baseBp === null) {
    const parts = [`remise générale sur ${describeTargets(rated)} seulement${rateRange(rated)}`];
    if (excluded.length > 0) {
      parts.push(`sauf ${describeTargets(excluded)}`);
    }
    return parts.join(", ");
  }
  const parts = [`remise générale −${describePercent(discount.baseBp)} %`];
  if (rated.length > 0) {
    parts.push(
      rated.length > 1 ? `${String(rated.length)} taux particuliers` : "1 taux particulier",
    );
  }
  if (excluded.length > 0) {
    parts.push(`sauf ${describeTargets(excluded)}`);
  }
  return parts.join(", ");
}

function describeTargets(rules: readonly GeneralDiscountRule[]): string {
  const families = rules.filter((rule) => rule.target === "category").length;
  const articles = rules.length - families;
  const words = [
    families === 0 ? null : `${String(families)} ${families > 1 ? "familles" : "famille"}`,
    articles === 0 ? null : `${String(articles)} ${articles > 1 ? "articles" : "article"}`,
  ].filter((word) => word !== null);
  return words.join(" et ");
}

/** « (−30 %) », « (−25 % à −40 %) » — les taux des lignes d'une remise « seulement ». */
function rateRange(rules: readonly GeneralDiscountRule[]): string {
  const rates = rules.flatMap((rule) => (rule.bp === null ? [] : [rule.bp]));
  if (rates.length === 0) {
    return "";
  }
  const low = Math.min(...rates);
  const high = Math.max(...rates);
  return low === high
    ? ` (−${describePercent(low)} %)`
    : ` (−${describePercent(low)} % à −${describePercent(high)} %)`;
}
