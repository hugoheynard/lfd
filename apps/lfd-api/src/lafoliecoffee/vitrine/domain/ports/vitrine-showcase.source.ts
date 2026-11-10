import type { ContentLocale, ShopCatalogueView } from "@lfd/contracts";

/**
 * **Ce que la vitrine relit** : la vue publique de la boutique et ses textes
 * effectifs, dans une langue (W1′). Rien d'autre ne sort — ni une seconde
 * projection, ni un prix qui ne serait pas celui du rayon public.
 */
export abstract class VitrineShowcaseSource {
  abstract catalogue(language: ContentLocale): Promise<ShopCatalogueView>;
  /** Le publié s'il existe, sinon le texte du code (S1). */
  abstract texts(language: ContentLocale): Promise<Readonly<Record<string, string>>>;
}
