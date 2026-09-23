import { computed, signal, type Signal, type WritableSignal } from '@angular/core';

import {
  LOCALES,
  SOURCE_LOCALE,
  type CategoryMediaView,
  type Locale,
  type LocalizedText,
} from '@lfd/pim-contracts';

import type { PickedMedia } from '../library-picker/library-picker';

/**
 * Les visuels en cours de composition — la liste, et les gestes qui la changent.
 *
 * 🔴 **Plus aucun dépôt depuis le 2026-09-23.** Une famille ne reçoit pas
 * d'octets : elle RATTACHE une URL de la médiathèque, qui est le seul fonds.
 * Alimenter et taguer ce fonds est un autre métier que composer une famille —
 * un dépôt offert ici aurait produit des images que personne ne retrouve.
 */
export interface MediaDraft {
  readonly items: WritableSignal<readonly CategoryMediaView[]>;
  /** Les langues dont une alternative manque, quelque part dans la liste. */
  readonly missing: Signal<readonly Locale[]>;
  /** Ce qui manque à CETTE image ; vide quand tout y est. */
  missingOf(index: number): readonly Locale[];
  adopt(source: readonly CategoryMediaView[]): void;
  /**
   * Rattache des images de la bibliothèque, en fin de liste.
   *
   * 🔴 Les URL **déjà présentes sont ignorées**, silencieusement : la même
   * image deux fois dans une famille n'a pas de sens, et la clé primaire
   * `(famille, url, rôle)` la refuserait de toute façon — l'écran ne doit pas
   * laisser produire la situation pour la voir refusée ensuite.
   */
  addFromLibrary(picked: readonly PickedMedia[]): void;
  remove(index: number): void;
  rename(index: number, name: string): void;
  describe(index: number, alt: LocalizedText | undefined): void;
}

/** Le rôle des visuels d'une famille.
 *
 *  `gallery` pour tous, et c'est un choix : cette section AGRÈGE des ressources,
 *  elle ne les classe pas. Quelle image une boutique prend pour vignette est une
 *  décision du CANAL — la même règle que sur la fiche produit, où la notion de
 *  « principale » avait été retirée faute de consommateur. */
const ROLE = 'gallery';

export function mediaDraft(): MediaDraft {
  const items = signal<readonly CategoryMediaView[]>([]);

  const missingOf = (index: number): readonly Locale[] => {
    const slot = items()[index];
    if (slot === undefined) {
      return [];
    }
    return LOCALES.filter((locale) => (slot.alt[locale] ?? '').trim() === '');
  };

  const patch = (index: number, change: Partial<CategoryMediaView>): void => {
    items.update((current) =>
      current.map((slot, position) => (position === index ? { ...slot, ...change } : slot)),
    );
  };

  return {
    items,
    missingOf,
    missing: computed(() => {
      const seen = new Set<Locale>();
      items().forEach((_, index) => {
        for (const locale of missingOf(index)) {
          seen.add(locale);
        }
      });
      return LOCALES.filter((locale) => seen.has(locale));
    }),
    adopt(source) {
      items.set([...source]);
    },
    addFromLibrary(picked) {
      items.update((current) => {
        const known = new Set(current.map((slot) => slot.url));
        const added = picked
          .filter((image) => !known.has(image.url))
          .map((image) => ({
            role: ROLE,
            url: image.url,
            name: image.name,
            // Sans alternative écrite, l'URL : la colonne est obligatoire, et
            // une chaîne vide passerait pour une alternative rédigée.
            //
            // ⚠️ L'alternative RÉELLE vit dans la médiathèque et n'est pas
            // relue ici : la liste ne sert qu'à composer, et le serveur relit
            // la bibliothèque à l'enregistrement.
            alt: { [SOURCE_LOCALE]: image.url },
            width: image.width,
            height: image.height,
            bytes: image.bytes,
            contentType: image.contentType,
          }));
        return [...current, ...added];
      });
    },
    remove(index) {
      items.update((current) => current.filter((_, position) => position !== index));
    },
    rename(index, name) {
      patch(index, { name });
    },
    describe(index, alt) {
      const slot = items()[index];
      if (slot === undefined) {
        return;
      }
      // Annuler ne doit pas effacer : `undefined` laisse l'alternative en place.
      patch(index, { alt: alt ?? slot.alt });
    },
  };
}
