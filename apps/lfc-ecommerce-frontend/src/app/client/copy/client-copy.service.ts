import { computed, effect, inject, Injectable, PendingTasks, signal } from '@angular/core';

import { ClientLocale, type LocaleCode } from '../client-locale.service';
import type { ClientCopy } from './client-copy.model';
import { FR } from './fr';
import { DICTIONARY_SPACE, ShopCopyComposer } from './shop-copy-composer';

/**
 * Les langues autres que le français, chargées à la demande.
 *
 * Le français est la langue source et la langue de repli : il reste dans le
 * bundle initial. L'anglais et l'italien pesaient ~110 kB de plus au démarrage
 * pour un visiteur qui, le plus souvent, ne les lira jamais (décision de Hugo,
 * 2026-10-29 — budget initial de la boutique dépassé).
 */
const LAZY_DICTIONARIES: Record<Exclude<LocaleCode, 'fr'>, () => Promise<ClientCopy>> = {
  en: () => import('./en').then((m) => m.EN),
  it: () => import('./it').then((m) => m.IT),
};
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

  private readonly pendingTasks = inject(PendingTasks);
  private readonly dictionaries = signal<Partial<Record<LocaleCode, ClientCopy>>>({ fr: FR });
  private readonly requests = new Map<LocaleCode, Promise<void>>();

  /**
   * La langue dont le dictionnaire est ARRIVÉ. Elle suit `ClientLocale.current`
   * avec le délai d'un chunk : entre le clic et l'arrivée, l'écran garde la
   * langue qu'il montrait — jamais un aller-retour par le français.
   */
  private readonly served = signal<LocaleCode>('fr');

  readonly t = computed<ClientCopy>(() => {
    const locale = this.served();
    return this.composer.compose(DICTIONARY_SPACE, this.dictionaryOf(locale), locale);
  });

  constructor() {
    effect(() => {
      const wanted = this.locale.current();
      void this.whenReady(wanted).then(() => {
        if (this.locale.current() === wanted) {
          this.served.set(wanted);
        }
      });
    });
  }

  /**
   * Charge le dictionnaire d'une langue — une fois par visite. Ne rejette
   * jamais : un chunk introuvable laisse la langue servie telle quelle.
   * Tenu comme tâche en cours, pour que le rendu serveur et `whenStable()`
   * l'attendent.
   */
  whenReady(locale: LocaleCode): Promise<void> {
    if (locale === 'fr') {
      return Promise.resolve();
    }
    const known = this.requests.get(locale);
    if (known !== undefined) {
      return known;
    }
    const done = this.pendingTasks.add();
    const request = LAZY_DICTIONARIES[locale]()
      .then(
        (copy) => this.dictionaries.update((all) => ({ ...all, [locale]: copy })),
        () => undefined,
      )
      .finally(done);
    this.requests.set(locale, request);
    return request;
  }

  private dictionaryOf(locale: LocaleCode): ClientCopy {
    return this.dictionaries()[locale] ?? FR;
  }

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
   *
   * Depuis le chargement à la demande (2026-10-29), seules les langues DÉJÀ
   * chargées comptent : une langue jamais choisie n'est pas téléchargée pour
   * mesurer un bouton. La place s'élargit donc au premier passage dans une
   * langue — au moment même où son libellé s'affiche.
   */
  everyLocale<T>(pick: (copy: ClientCopy) => T): readonly T[] {
    const loaded = this.dictionaries();
    return LOCALE_CODES.flatMap((locale) => {
      const copy = loaded[locale];
      return copy === undefined
        ? []
        : [pick(this.composer.compose(DICTIONARY_SPACE, copy, locale))];
    });
  }
}

/** Remplace les `{jetons}` d'une phrase par leur valeur. */
export function fill(sentence: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    sentence,
  );
}
