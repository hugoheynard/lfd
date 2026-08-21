/**
 * **Le handle de la collection de taxe**, dérivé d'un taux : `5.5` → `tva-5-5`.
 *
 * Cette dérivation vivait dans le référentiel, sur le value object `TvaPercent` et
 * en colonne de `tva_rate`. Ce n'était pas sa place : un handle de collection
 * est du vocabulaire **Shopify**, et le référentiel se mettait à décrire un de
 * ses consommateurs. Elle vit donc ici, chez le seul qui en ait jamais eu
 * besoin — la boutique B2B, elle, lit un nombre et facture avec.
 *
 * Le préfixe est partagé avec la réconciliation (`TVA_HANDLE_PREFIX`), qui s'en
 * sert pour repérer les collections orphelines.
 */
export function tvaHandleOf(percent: number): string {
  return `tva-${String(percent).replace(".", "-")}`;
}
