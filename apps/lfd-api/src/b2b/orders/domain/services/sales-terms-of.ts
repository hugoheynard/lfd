import type { CustomerAudience, SalesTermsDocument } from "@lfd/contracts";

/**
 * **Les CGV qui s'appliquent à une clientèle** (plan
 * `legal/plan-cgv-par-audience.md`, C2″) : les professionnelles pour `b2b`,
 * celles des particuliers sinon.
 *
 * 🔴 L'audience est celle qui TARIFE la commande (`audienceOf` : une société
 * ACTIVE seulement). Une société en attente de validation paie les prix des
 * particuliers ; elle est liée par leurs CGV, pas par celles des pros.
 */
export function salesTermsOf(audience: CustomerAudience): SalesTermsDocument {
  return audience === "b2b" ? "salesTermsPro" : "salesTerms";
}
