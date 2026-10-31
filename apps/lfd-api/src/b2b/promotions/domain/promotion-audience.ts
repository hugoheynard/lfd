import { PromotionMissingTargetIdError } from "./errors/promotion-errors.js";

/**
 * **Le public d'une promotion** — un seul menu (`documentation/promotions/promotions.md`, § 2.16) :
 * tout le monde · particuliers (tous, invités, inscrits) · pros (tous,
 * actifs, en cours d'inscription, une société ± ses sites), plus
 * `everyone_but_active_pros`, le public de reprise qui reproduit exactement
 * `audienceOf` pour la remise de retrait des particuliers (§ 13.2).
 *
 * Un type somme FERMÉ : un public neuf (le segment, prévu et non bâti) est
 * une variante de plus et son évaluateur, sans toucher aux autres. Une
 * variante sans évaluateur serait une promesse — d'où son absence.
 */
export type PromotionAudience =
  | { readonly kind: "everyone" }
  | { readonly kind: "individuals" }
  | { readonly kind: "individuals_guest" }
  | { readonly kind: "individuals_registered" }
  | { readonly kind: "pros" }
  | { readonly kind: "pros_active" }
  | { readonly kind: "pros_pending" }
  | { readonly kind: "company"; readonly companyId: string }
  | { readonly kind: "company_and_sites"; readonly companyId: string }
  | { readonly kind: "everyone_but_active_pros" };

export type PromotionAudienceKind = PromotionAudience["kind"];

export const PROMOTION_AUDIENCE_KINDS: readonly PromotionAudienceKind[] = [
  "everyone",
  "individuals",
  "individuals_guest",
  "individuals_registered",
  "pros",
  "pros_active",
  "pros_pending",
  "company",
  "company_and_sites",
  "everyone_but_active_pros",
];

/** Les publics qui nomment une société. */
export function audienceCompanyIdOf(audience: PromotionAudience): string | null {
  return audience.kind === "company" || audience.kind === "company_and_sites"
    ? audience.companyId
    : null;
}

/**
 * Le public tel qu'il se relit de ses deux colonnes — `null` pour une valeur
 * inconnue, que l'adaptateur nomme.
 *
 * @throws {PromotionMissingTargetIdError} un public « société » sans société.
 */
export function audienceOf(kind: string, companyId: string | null): PromotionAudience | null {
  switch (kind) {
    case "company":
    case "company_and_sites":
      if (companyId === null || companyId.trim() === "") {
        throw new PromotionMissingTargetIdError("company");
      }
      return { kind, companyId };
    case "everyone":
    case "individuals":
    case "individuals_guest":
    case "individuals_registered":
    case "pros":
    case "pros_active":
    case "pros_pending":
    case "everyone_but_active_pros":
      return { kind };
    default:
      return null;
  }
}

/** Le libellé du public, tel que le staff le lit dans un résumé. */
export const AUDIENCE_LABEL: Readonly<Record<PromotionAudienceKind, string>> = {
  everyone: "tout le monde",
  individuals: "particuliers",
  individuals_guest: "particuliers sans compte",
  individuals_registered: "particuliers inscrits",
  pros: "pros",
  pros_active: "pros actifs",
  pros_pending: "pros en cours d'inscription",
  company: "une société",
  company_and_sites: "une société et ses sites",
  everyone_but_active_pros: "tous sauf les pros actifs",
};
