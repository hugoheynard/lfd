/**
 * **Les anciens codes de rayon — pour LIRE le passé, jamais pour écrire.**
 *
 * Jusqu'au 2026-09-26, une portée « famille » portait un code de rayon
 * (`viennoiserie`) au lieu de l'identifiant du référentiel, et la table qui
 * traduisait l'un en l'autre était en dur. Elle a mis le catalogue pro en 500
 * le jour où le PIM a créé une famille qu'elle ne connaissait pas (plan
 * `documentation/pricing/plan-familles-en-donnees.md`).
 *
 * Les décisions vivantes ont été reprises par la migration
 * `les_familles_se_lisent_en_donnees`. Ce qui garde les codes, c'est ce qui
 * est **immuable** : les sujets du journal tarifaire (`category:viennoiserie`)
 * et les traces figées sur les lignes de commande. Ce fichier est leur seul
 * lecteur.
 *
 * - `label` : le libellé d'écran d'alors, pour nommer une portée passée ;
 * - `slug` : le lien stable vers la famille d'aujourd'hui — c'est par lui que
 *   la migration a trouvé l'identifiant.
 *
 * 🔴 **Il ne grandira plus.** Une famille nouvelle est une donnée ; ajouter une
 * ligne ici referait la table qu'on vient de retirer. `lint:no-shelf-literals`
 * refuse tout littéral de rayon hors de ce fichier.
 */
const LEGACY_SHELF_CODES: Readonly<
  Record<string, { readonly label: string; readonly slug: string }>
> = {
  viennoiserie: { label: "Viennoiseries", slug: "viennoiseries" },
  pain: { label: "Pains", slug: "pains" },
  patisserie: { label: "Pâtisseries", slug: "patisseries" },
  sale: { label: "Salé & traiteur", slug: "sale-traiteur" },
  chocolat: { label: "Chocolat & confiserie", slug: "chocolat-confiserie" },
};

/** Le libellé d'un ancien code de rayon, ou `null` si ce n'en est pas un. */
export function legacyShelfLabel(code: string): string | null {
  return Object.hasOwn(LEGACY_SHELF_CODES, code) ? (LEGACY_SHELF_CODES[code]?.label ?? null) : null;
}

/** L'ancien code de rayon dont une famille porte le slug, ou `null`. */
export function legacyShelfCodeOfSlug(slug: string): string | null {
  const found = Object.entries(LEGACY_SHELF_CODES).find(([, legacy]) => legacy.slug === slug);
  return found?.[0] ?? null;
}
