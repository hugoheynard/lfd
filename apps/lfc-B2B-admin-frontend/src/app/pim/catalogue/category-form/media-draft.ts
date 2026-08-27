import { computed, signal, type Signal, type WritableSignal } from '@angular/core';

import {
  LOCALES,
  SOURCE_LOCALE,
  type CategoryMediaView,
  type Locale,
  type LocalizedText,
} from '@lfd/pim-contracts';

import type { CategoryHttpApi } from '../category-http-api';

/**
 * Les visuels en cours de composition — la liste, et les gestes qui la changent.
 *
 * Déposer et enregistrer sont VOLONTAIREMENT distincts : déposer crée un fichier
 * dans la bibliothèque et ne touche à aucune famille ; enregistrer remplace la
 * liste de CETTE famille. C'est ce qui permet à un même fichier de servir une
 * famille et une fiche sans être déposé deux fois.
 */
export interface MediaDraft {
  readonly items: WritableSignal<readonly CategoryMediaView[]>;
  /** Un dépôt est en cours — la zone de dépôt doit le dire. */
  readonly uploading: Signal<boolean>;
  /** Les langues dont une alternative manque, quelque part dans la liste. */
  readonly missing: Signal<readonly Locale[]>;
  /** Ce qui manque à CETTE image ; vide quand tout y est. */
  missingOf(index: number): readonly Locale[];
  adopt(source: readonly CategoryMediaView[]): void;
  /** Dépose un fichier et l'ajoute en fin de liste. Rend l'échec à l'appelant. */
  upload(file: File): Promise<void>;
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

export function mediaDraft(api: CategoryHttpApi): MediaDraft {
  const items = signal<readonly CategoryMediaView[]>([]);
  const uploading = signal(false);

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
    uploading: uploading.asReadonly(),
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
    async upload(file) {
      uploading.set(true);
      try {
        const uploaded = await api.uploadMedia(file);
        items.update((current) => [
          ...current,
          {
            role: ROLE,
            url: uploaded.url,
            name: '',
            // Sans alternative écrite, l'URL : la colonne est obligatoire, et
            // une chaîne vide passerait pour une alternative rédigée.
            alt: { [SOURCE_LOCALE]: uploaded.url },
            width: uploaded.width,
            height: uploaded.height,
            bytes: uploaded.bytes,
            contentType: uploaded.contentType,
          },
        ]);
      } finally {
        uploading.set(false);
      }
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
