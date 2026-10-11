import { Injectable, signal } from '@angular/core';

import type { LocaleCode } from '../client-locale.service';

type PublishedTexts = Readonly<Record<string, string>>;

/**
 * **Les remplacements publiés des textes**, par langue — l'état seul.
 *
 * Sans dépendance : `ClientCopyService` le lit, et tout écran qui lit les
 * textes le lit donc aussi. Il ne doit rien coûter à construire, ni rien
 * demander au réseau — c'est `ShopCopyLoader`, branché au démarrage, qui le
 * remplit.
 */
@Injectable({ providedIn: 'root' })
export class ShopCopyOverrides {
  private readonly loaded = signal<Partial<Record<LocaleCode, PublishedTexts>>>({});

  /** Les remplacements d'une langue ; vide tant qu'ils ne sont pas arrivés. */
  texts(locale: LocaleCode): PublishedTexts {
    return this.loaded()[locale] ?? {};
  }

  /** Pose les remplacements reçus pour une langue. */
  receive(locale: LocaleCode, texts: PublishedTexts): void {
    this.loaded.update((all) => ({ ...all, [locale]: texts }));
  }
}
