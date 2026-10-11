import { computed, inject, Injectable, type Signal } from '@angular/core';

import { ClientLocale, type LocaleCode } from '../client-locale.service';
import { overlayCopy } from './shop-copy-overlay';
import { ShopCopyOverrides } from './shop-copy-overrides';

/** L'espace du dictionnaire général : ses clés sont lues depuis la racine. */
export const DICTIONARY_SPACE = '';

/**
 * **Le seul point où un texte du code reçoit ses remplacements** — le
 * dictionnaire général (`ClientCopyService`) comme chaque fonction d'écran
 * (`screenCopy`), plan `plan-textes-de-la-boutique.md`, §4 et lot T4.
 *
 * Un espace est le préfixe de clé que le manifeste donne à un texte
 * (`slotPicker.` pour `slotPickerCopy`) : seuls les remplacements de cet
 * espace sont superposés, préfixe retiré. Une clé inconnue est ignorée par
 * `overlayCopy` — le texte du code reste.
 *
 * Un service, et non une fonction, pour que l'aperçu le REMPLACE à la
 * composition (il y ajoute le marqueur de clé) sans qu'aucune branche ne
 * vive dans la boutique.
 */
@Injectable({ providedIn: 'root' })
export class ShopCopyComposer {
  protected readonly overrides = inject(ShopCopyOverrides);

  /** Le texte du code d'un espace, ses remplacements de la langue superposés. */
  compose<T extends object>(space: string, base: T, locale: LocaleCode): T {
    return overlayCopy(base, textsOfSpace(this.overrides.texts(locale), space));
  }
}

/** Les remplacements d'un espace, clés relatives à lui. */
export function textsOfSpace(
  texts: Readonly<Record<string, string>>,
  space: string,
): Readonly<Record<string, string>> {
  if (space === DICTIONARY_SPACE) {
    return texts;
  }
  const prefix = `${space}.`;
  const within: Record<string, string> = {};
  for (const [key, text] of Object.entries(texts)) {
    if (key.startsWith(prefix)) {
      within[key.slice(prefix.length)] = text;
    }
  }
  return within;
}

/**
 * **Les textes d'un écran**, dans la langue courante et remplacements compris —
 * un `computed` : changer de langue OU recevoir un remplacement redessine
 * l'écran. À appeler dans un contexte d'injection (initialiseur de champ).
 *
 * `space` est l'espace du manifeste (`dev-toolbox/shop-copy/spaces.mjs`).
 */
export function screenCopy<T extends object>(
  space: string,
  copyOf: (locale: LocaleCode) => T,
): Signal<T> {
  const locale = inject(ClientLocale);
  const composer = inject(ShopCopyComposer);
  return computed(() => {
    const current = locale.current();
    return composer.compose(space, copyOf(current), current);
  });
}
