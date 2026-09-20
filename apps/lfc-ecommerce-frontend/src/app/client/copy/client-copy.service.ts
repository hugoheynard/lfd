import { computed, inject, Injectable } from '@angular/core';

import { ClientLocale, type LocaleCode } from '../client-locale.service';
import type { ClientCopy } from './client-copy.model';
import { EN } from './en';
import { FR } from './fr';
import { IT } from './it';

const DICTIONARIES: Record<LocaleCode, ClientCopy> = { fr: FR, en: EN, it: IT };

/**
 * Ce que l'app dit, dans la langue choisie.
 *
 * Un `computed` et rien d'autre : changer de langue change la valeur, et tout ce
 * qui la lit se redessine. Aucun abonnement, aucun rechargement.
 */
@Injectable({ providedIn: 'root' })
export class ClientCopyService {
  private readonly locale = inject(ClientLocale);

  readonly t = computed<ClientCopy>(() => DICTIONARIES[this.locale.current()]);
}

/** Remplace les `{jetons}` d'une phrase par leur valeur. */
export function fill(sentence: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    sentence,
  );
}
