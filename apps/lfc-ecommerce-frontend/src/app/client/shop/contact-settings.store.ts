import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
// Valeurs par le sous-chemin sans zod : l'accueil est au démarrage (budget `cloudflare`).
import {
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
 * public (`GET /contact-settings`, public ; `documentation/demandes-client/demandes-clients.md`, §4).
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
 * la langue de l'écran — aucun si la carte de ce public coupe le numéro
 * (« Afficher le numéro de téléphone », 2026-10-26). Aucun → liste VIDE, et l'écran ne montre pas de numéro :
 * le numéro de repli a été retiré parce qu'il affichait une information fausse
 * (décision de Hugo, 2026-10-26 — « on ne peut plus afficher une information
 * fausse »).
 */
export function phonesFor(
  settings: PublicContactSettingsView,
  audience: CustomerAudience,
  locale: LocaleCode,
): readonly ShownPhone[] {
  // `=== false`, pas `!` : une API d'avant le 2026-10-26 ne sert pas
  // l'interrupteur, et son absence veut dire « affiché », comme avant.
  if (settings.cards[audience].showPhone === false) {
    return [];
  }
  return settings.phones
    .filter((phone) => phone.audience === 'both' || phone.audience === audience)
    .map((phone) => ({ label: localizedOr(phone.label, locale, ''), number: phone.number.trim() }))
    .filter((phone) => phone.number !== '');
}

/** Un mot de bouton absent : une API d'avant le 2026-10-26 ne le sert pas. */
const EMPTY_LABEL: ContactLocalizedText = { fr: '', en: '', it: '' };

/** Les mots de la boutique pour les deux boutons, quand le réglage n'en pose pas. */
export interface ContactWords {
  readonly call: string;
  readonly write: string;
}

/** Ce qu'une carte offre, réglage et dictionnaire déjà fondus. */
export interface ShownContact {
  readonly phones: readonly ShownPhone[];
  readonly call: string;
  readonly write: string;
  /** « Afficher le formulaire de contact » : faux, pas de bouton « Écrire ». */
  readonly canWrite: boolean;
  /**
   * Le message d'une carte qui n'offre ni numéro ni formulaire (« Nous vous
   * contacterons bientôt ») ; `''` dès qu'elle offre l'un des deux.
   */
  readonly noContact: string;
}

/**
 * **Ce que la carte de ce public offre** (décision de Hugo, 2026-10-26) : ses
 * numéros, ses deux mots de bouton (le réglage, sinon le dictionnaire), et son
 * message quand elle n'offre rien. Aucun repli pour ce message : vide, rien.
 */
export function contactFor(
  settings: PublicContactSettingsView,
  audience: CustomerAudience,
  locale: LocaleCode,
  words: ContactWords,
): ShownContact {
  const card = settings.cards[audience];
  const phones = phonesFor(settings, audience, locale);
  // `=== false` : absent (API d'avant), le formulaire reste affiché.
  const canWrite = card.showForm !== false;
  const silent = phones.length === 0 && !canWrite;
  return {
    phones,
    call: localizedOr(card.callLabel ?? EMPTY_LABEL, locale, words.call),
    write: localizedOr(card.writeLabel ?? EMPTY_LABEL, locale, words.write),
    canWrite,
    noContact: silent ? localizedOr(card.noContactMessage ?? EMPTY_LABEL, locale, '') : '',
  };
}
