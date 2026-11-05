import type { CustomerAudience, SalesTermsDocument } from "@lfd/contracts";

/**
 * **Les CGV qui s'appliquent à une clientèle** (plan
 * `legal/plan-cgv-par-audience.md`, C2″) : les professionnelles pour `b2b`,
 * celles des particuliers sinon.
 *
 * 🔴 L'audience est celle qui TARIFE la commande (`audienceOf` : une société
 * active, suspendue ou en attente depuis le 2026-11-05). Une société en
 * attente paie les prix des pros ; elle est liée par leurs CGV.
 */
export function salesTermsOf(audience: CustomerAudience): SalesTermsDocument {
  return audience === "b2b" ? "salesTermsPro" : "salesTerms";
}

/**
 * **La clientèle d'une commande passée**, lue sur les CGV qu'elle a figées —
 * l'inverse de {@link salesTermsOf}. C'est la seule trace de la clientèle
 * qui a tarifé la commande : la révision la relit là (É13, Hugo, 2026-11-03)
 * plutôt qu'au statut de la société aujourd'hui.
 */
export function audienceOfSalesTerms(document: SalesTermsDocument): CustomerAudience {
  return document === "salesTermsPro" ? "b2b" : "b2c";
}
