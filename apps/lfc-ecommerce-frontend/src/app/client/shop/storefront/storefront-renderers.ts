import { InjectionToken, type InputSignal, type Type } from '@angular/core';
import type { PublicStorefrontContent } from '@lfd/contracts';
import type { MediaFit, MediaSide, StorefrontShape, StorefrontTone } from '@lfd/storefront-layout';

import { InfoCard } from './info-card/info-card';
import { StorefrontProduct } from './storefront-product/storefront-product';

/**
 * Ce que TOUT rendu de contenu reçoit, quel que soit son type
 * (`plan-vitrine-enregistrement.md`, D10). La case les passe par
 * `ngComponentOutletInputs` : un nom qui manquerait ici lèverait à
 * l'exécution, pas à la compilation — d'où ce contrat.
 */
export interface StorefrontRenderer {
  readonly content: InputSignal<PublicStorefrontContent>;
  readonly shape: InputSignal<StorefrontShape>;
  readonly mediaFit: InputSignal<MediaFit>;
  readonly mediaSide: InputSignal<MediaSide>;
  readonly tone: InputSignal<StorefrontTone>;
}

export type StorefrontContentKind = PublicStorefrontContent['kind'];

/**
 * **Le registre** : un composant par TYPE DE CONTENU, jamais par forme — la
 * forme arrive en entrée et le composant s'y adapte par container queries.
 * Ajouter un type (vidéo, recette…) = une ligne ici et un composant ; la
 * grille ne change pas.
 */
export const STOREFRONT_RENDERERS = new InjectionToken<
  Readonly<Record<StorefrontContentKind, Type<StorefrontRenderer>>>
>('STOREFRONT_RENDERERS', {
  providedIn: 'root',
  factory: () => ({ product: StorefrontProduct, info: InfoCard }),
});
