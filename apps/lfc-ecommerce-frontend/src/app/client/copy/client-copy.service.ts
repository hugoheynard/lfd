import { computed, inject, Injectable } from '@angular/core';

import { ClientLocale, type LocaleCode } from '../client-locale.service';
import type { ClientCopy } from './client-copy.model';
import { EN } from './en';
import { FR } from './fr';
import { IT } from './it';
import { DICTIONARY_SPACE, ShopCopyComposer } from './shop-copy-composer';

const DICTIONARIES: Record<LocaleCode, ClientCopy> = { fr: FR, en: EN, it: IT };
const LOCALE_CODES: readonly LocaleCode[] = ['fr', 'en', 'it'];

/**
 * Ce que l'app dit, dans la langue choisie.
 *
 * Un `computed` et rien d'autre : changer de langue change la valeur, et tout ce
 * qui la lit se redessine. Aucun abonnement, aucun rechargement.
 *
 * Les remplacements publiés se superposent par `ShopCopyComposer`, le même
 * point que les fonctions d'écran (`screenCopy`) — clé par clé, une clé
 * inconnue ignorée ; c'est `ShopCopyLoader`, au démarrage, qui les lit (plan
 * `plan-textes-de-la-boutique.md`, lots T1 et T4).
 */
@Injectable({ providedIn: 'root' })
export class ClientCopyService {
  private readonly locale = inject(ClientLocale);
  private readonly composer = inject(ShopCopyComposer);

  readonly t = computed<ClientCopy>(() => {
    const locale = this.locale.current();
    return this.composer.compose(DICTIONARY_SPACE, DICTIONARIES[locale], locale);
  });

  /**
   * La même phrase dans TOUTES les langues.
   *
   * Sert à RÉSERVER LA PLACE de la plus longue, là où un libellé qui change de
   * largeur en changeant de langue déplacerait ce qui l'entoure — le bouton
   * d'entrée de la barre est le cas type : il est en bout de rangée, et sa
   * largeur pousse tout le reste.
   *
   * ⚠️ Ce n'est pas une façon de LIRE une autre langue que la sienne : rien de
   * ce que ça rend n'est destiné à être affiché. Ce qu'on affiche vient de `t`,
   * et lui seul.
   *
   * Remplacements compris : la place réservée est celle du texte servi. Lu
   * dans un `computed`, le résultat suit leur arrivée.
   */
  everyLocale<T>(pick: (copy: ClientCopy) => T): readonly T[] {
    return LOCALE_CODES.map((locale) =>
      pick(this.composer.compose(DICTIONARY_SPACE, DICTIONARIES[locale], locale)),
    );
  }
}

/** Remplace les `{jetons}` d'une phrase par leur valeur. */
export function fill(sentence: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    sentence,
  );
}
