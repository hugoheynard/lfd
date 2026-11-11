import type {
  GeneralDiscount,
  GeneralDiscountRule,
} from "../domain/entities/company-mercuriale.js";
import { checkedGeneralDiscount } from "../domain/entities/general-discount.js";
import { CorruptedMercurialeError } from "../domain/pricing-errors.js";

/**
 * **La remise générale ↔ sa colonne `jsonb`** (`plan-remise-generale.md`, § 3).
 *
 * La colonne arrive en `unknown`. Le CHECK de la table tient la forme
 * grossière (mode connu, taux de base entier borné, `rules` tableau) ; le
 * reste — chaque ligne, la cohérence mode/taux, les doublons — est revérifié
 * ici par le domaine (`checkedGeneralDiscount`), parce qu'une remise mal
 * formée sortirait en prix.
 */

/** La remise d'une ligne de base, vérifiée. `null` = aucune. */
export function generalDiscountFromJson(id: string, value: unknown): GeneralDiscount | null {
  if (value === null) {
    return null;
  }
  const discount = parsedGeneralDiscount(value);
  if (discount === null) {
    throw new CorruptedMercurialeError(id, "la remise générale n'a pas la forme attendue");
  }
  try {
    return checkedGeneralDiscount(discount);
  } catch {
    throw new CorruptedMercurialeError(id, "la remise générale enfreint ses propres règles");
  }
}

/**
 * La forme seule, sans les règles du domaine — `null` si elle ne tient pas.
 * Le brouillon s'en sert tel quel : il n'a pas d'invariant, et une saisie
 * illisible y redevient « aucune remise » plutôt que de fermer l'écran.
 */
export function parsedGeneralDiscount(value: unknown): GeneralDiscount | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw: Record<string, unknown> = { ...value };
  const { mode, baseBp, rules } = raw;
  if ((mode !== "all_except" && mode !== "only") || !Array.isArray(rules)) {
    return null;
  }
  if (baseBp !== null && typeof baseBp !== "number") {
    return null;
  }
  const parsed: GeneralDiscountRule[] = [];
  for (const rule of rules) {
    const line = parsedRule(rule);
    if (line === null) {
      return null;
    }
    parsed.push(line);
  }
  return { mode, baseBp, rules: parsed };
}

function parsedRule(value: unknown): GeneralDiscountRule | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw: Record<string, unknown> = { ...value };
  const { target, targetId, bp } = raw;
  if (target !== "category" && target !== "variant") {
    return null;
  }
  if (typeof targetId !== "string" || (bp !== null && typeof bp !== "number")) {
    return null;
  }
  return { target, targetId, bp };
}

/**
 * La remise telle qu'elle s'écrit — réécrite champ par champ, pour la raison
 * dite sur `PrismaCompanyMercurialeRepository.save` : une interface n'a pas de
 * signature d'index, et un champ ajouté au domaine ne part pas en base par
 * accident.
 */
export function generalDiscountJson(discount: GeneralDiscount): {
  mode: GeneralDiscount["mode"];
  baseBp: number | null;
  rules: { target: GeneralDiscountRule["target"]; targetId: string; bp: number | null }[];
} {
  return {
    mode: discount.mode,
    baseBp: discount.baseBp,
    rules: discount.rules.map((rule) => ({
      target: rule.target,
      targetId: rule.targetId,
      bp: rule.bp,
    })),
  };
}
