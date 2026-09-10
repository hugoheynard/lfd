/**
 * **Les champs d'une révision, dits en français.**
 *
 * Le diff rendait les clés brutes du payload — `priceCents`, `vatByContext`,
 * `soldContexts`. Elles sont exactes et illisibles : devant cinquante lignes,
 * on cherche ce qui a bougé, pas le nom d'une propriété. Un commercial ne sait
 * pas que `readyAt` est la signature de la fiche.
 *
 * 🔴 **La liste couvre les clés de `RevisionItemInput`, et rien d'autre.** Elle
 * est écrite à la main faute d'un contrat qui les nomme côté front, ce qui la
 * rend périssable : un champ ajouté à une révision n'apparaîtra pas ici. C'est
 * pour ça que l'inconnu retombe sur la clé brute au lieu d'un « champ » vague —
 * un nom technique qu'on ne comprend pas se cherche, un libellé générique ne se
 * cherche pas.
 */
const LABELS: Readonly<Record<string, string>> = {
  sku: "Référence de l'article",
  productId: 'Identifiant du produit',
  productSku: 'Référence du produit',
  name: 'Nom du produit',
  variantName: 'Nom de la déclinaison',
  kind: 'Nature',
  status: 'Statut',
  categoryId: 'Identifiant de la famille',
  categoryName: 'Famille',
  priceCents: 'Prix public TTC',
  weightGrams: 'Poids',
  isDefault: 'Déclinaison par défaut',
  isDiscontinued: 'Article arrêté',
  allergens: 'Allergènes',
  vatByContext: 'Taux de TVA par contexte',
  soldContexts: 'Contextes de vente',
  editorial: 'Contenu éditorial',
  media: 'Visuels',
  readyAt: 'Signature de la fiche',
  readyBy: 'Signataire de la fiche',
  proRatioBp: 'Rapport prix pro / prix public',
};

/** Le nom lisible d'un champ, ou la clé brute quand on ne la connaît pas. */
export function fieldLabel(field: string): string {
  return LABELS[field] ?? field;
}
