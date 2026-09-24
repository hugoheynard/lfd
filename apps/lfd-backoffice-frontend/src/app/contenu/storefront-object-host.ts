import type { Signal } from '@angular/core';
import type { StorefrontContent } from '@lfd/contracts';
import type {
  CarouselSettings,
  ContentsMode,
  MediaFit,
  MediaSide,
  ShelfKey,
  StorefrontShape,
  StorefrontTone,
} from '@lfd/storefront-layout';

import type { EditorBlock } from './storefront-block';
import type { ShelfOption, StorefrontCatalog } from './storefront-catalog';
import type { TemplateLabel } from './storefront-templates';

/**
 * Ce que le dialogue d'un objet lit et demande à l'éditeur.
 *
 * L'éditeur reste le SEUL à tenir la composition : le dialogue lit l'objet
 * sélectionné en signal — il suit donc chaque réglage appliqué — et renvoie des
 * intentions, que l'éditeur applique ou refuse. Le refus revient par `notice`,
 * que le dialogue affiche chez lui. Rien ne part au serveur : seul le bouton
 * « Enregistrer » de la page envoie.
 */
export interface StorefrontObjectHost {
  readonly selected: Signal<EditorBlock | null>;
  /** Le rayon édité : « ce rayon seulement », et la case qu'on ne décoche pas. */
  readonly shelf: Signal<ShelfKey>;
  readonly shelves: Signal<readonly ShelfOption[]>;
  readonly catalog: Signal<StorefrontCatalog | null>;
  /** Le dernier refus, dit en toutes lettres. */
  readonly notice: Signal<string | null>;

  setSelectedApplyOnMobile(value: boolean): void;
  setSelectedMedia(media: { readonly fit?: MediaFit; readonly side?: MediaSide }): void;
  setSelectedFormat(format: StorefrontShape): void;
  setSelectedTone(tone: StorefrontTone): void;
  setSelectedContents(value: ContentsMode): void;
  setSelectedCarousel(patch: Partial<CarouselSettings>): void;
  setSelectedShelves(shelves: readonly ShelfKey[]): void;
  setSelectedItems(items: readonly StorefrontContent[]): void;
  /** Rend `false` si le nom est refusé — le formulaire reste alors ouvert. */
  saveSelectedAsTemplate(label: TemplateLabel): boolean;
}

/** La charge d'ouverture du dialogue. */
export interface StorefrontObjectDialogData {
  readonly host: StorefrontObjectHost;
}
