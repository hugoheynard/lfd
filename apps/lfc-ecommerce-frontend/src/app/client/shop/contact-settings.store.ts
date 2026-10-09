import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
// Valeurs par le sous-chemin sans zod : l'accueil est au démarrage (budget `cloudflare`).
import {
  CONTACT_CARD_DEFAULTS,
  DEFAULT_CONTACT_SETTINGS,
  type ContactLocalizedText,
  type CustomerAudience,
  type PublicContactSettingsView,
} from '@lfd/contracts/shop-values';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import type { LocaleCode } from '../client-locale.service';

/**
 * **La carte de contact réglée au back-office** — le numéro et les textes par
 * public (`GET /contact-settings`, public ; `documentation/contenu-ecommerce/demandes-clients.md`, §4).
 *
 * Tant que le réglage n'est pas lu, ou si sa lecture échoue, il vaut son défaut
 * TOUT VIDE : la carte garde alors les textes du dictionnaire. Une lecture
 * ratée ne fait donc rien disparaître.
 */
/** Le défaut public : aucun numéro, les cartes vides du contrat. */
export const NO_CONTACT_SETTINGS: PublicContactSettingsView = {
  phones: [],
  cards: DEFAULT_CONTACT_SETTINGS.cards,
};

@Injectable({ providedIn: 'root' })
export class ContactSettingsStore {
  private readonly http = inject(HttpClient);

  private readonly held = signal<PublicContactSettingsView>(NO_CONTACT_SETTINGS);
  private asked = false;

  readonly settings = this.held.asReadonly();

  /** Lit le réglage, une fois. Un échec garde le défaut, et permet de relire. */
  async hydrate(): Promise<void> {
    if (this.asked) {
      return;
    }
    this.asked = true;
    try {
      this.held.set(
        await firstValueFrom(
          this.http.get<PublicContactSettingsView>(`${AUTH_CONFIG.apiBaseUrl}/contact-settings`),
        ),
      );
    } catch {
      this.asked = false;
    }
  }
}

/**
 * Le texte dans la langue de l'écran : la langue, sinon le français (la langue
 * de repli du réglage), sinon `fallback` — le dictionnaire de la boutique.
 */
export function localizedOr(
  text: ContactLocalizedText,
  locale: LocaleCode,
  fallback: string,
): string {
  const own = text[locale].trim();
  if (own !== '') {
    return own;
  }
  const fr = text.fr.trim();
  return fr === '' ? fallback : fr;
}

/** Le numéro tel qu'un `tel:` le compose : les chiffres et le `+` de tête, rien d'autre. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/gu, '')}`;
}

/** Un numéro tel qu'un écran le montre : libellé déjà dans la langue (vide s'il n'en a pas). */
export interface ShownPhone {
  readonly label: string;
  readonly number: string;
}

/**
 * Les numéros de ce public (`both` compris), dans l'ordre réglé, libellés dans
 * la langue de l'écran ; aucun → le seul numéro de repli de `CONTACT_CARD_DEFAULTS`.
 */
export function phonesFor(
  settings: PublicContactSettingsView,
  audience: CustomerAudience,
  locale: LocaleCode,
): readonly ShownPhone[] {
  const kept = settings.phones
    .filter((phone) => phone.audience === 'both' || phone.audience === audience)
    .map((phone) => ({ label: localizedOr(phone.label, locale, ''), number: phone.number.trim() }))
    .filter((phone) => phone.number !== '');
  return kept.length > 0 ? kept : [{ label: '', number: CONTACT_CARD_DEFAULTS.phone }];
}
