import { computed, inject, Injectable } from '@angular/core';

import { ClientLocale, type LocaleCode } from '../client-locale.service';
import type { ClientCopy } from './client-copy.model';
import { EN } from './en';
import { FR } from './fr';
import { IT } from './it';
import { overlayCopy } from './shop-copy-overlay';
import { ShopCopyOverrides } from './shop-copy-overrides';

const DICTIONARIES: Record<LocaleCode, ClientCopy> = { fr: FR, en: EN, it: IT };

/**
 * Ce que l'app dit, dans la langue choisie.
 *
 * Un `computed` et rien d'autre : changer de langue change la valeur, et tout ce
 * qui la lit se redessine. Aucun abonnement, aucun rechargement.
 *
 * C'est le SEUL point où les remplacements publiés (`ShopCopyOverrides`) se
 * superposent au texte du code — clé par clé, une clé inconnue ignorée ; c'est
 * `ShopCopyLoader`, au démarrage, qui les lit (plan
 * `plan-textes-de-la-boutique.md`, lot T1). Les fonctions d'écran
 * (`*Copy(locale)`) n'en passent pas encore par là : elles migrent en T4.
 */
@Injectable({ providedIn: 'root' })
export class ClientCopyService {
  private readonly locale = inject(ClientLocale);
  private readonly overrides = inject(ShopCopyOverrides);

  readonly t = computed<ClientCopy>(() => {
    const locale = this.locale.current();
    return overlayCopy(DICTIONARIES[locale], this.overrides.texts(locale));
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
   */
  everyLocale<T>(pick: (copy: ClientCopy) => T): readonly T[] {
    return Object.values(DICTIONARIES).map(pick);
  }
}

/** Remplace les `{jetons}` d'une phrase par leur valeur. */
export function fill(sentence: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    sentence,
  );
}
