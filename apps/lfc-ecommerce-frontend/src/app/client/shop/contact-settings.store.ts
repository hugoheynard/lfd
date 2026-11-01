import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
// Valeurs par le sous-chemin sans zod : l'accueil est au démarrage (budget `cloudflare`).
import {
  DEFAULT_CONTACT_SETTINGS,
  type AudienceContactSettingsView,
  type ContactLocalizedText,
} from '@lfd/contracts/shop-values';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientWorkspace } from '../client-workspace.service';
import type { LocaleCode } from '../client-locale.service';

/** Le défaut : aucun numéro, la carte vide du contrat (la boutique garde son dictionnaire). */
export const NO_CONTACT_SETTINGS: AudienceContactSettingsView = {
  phones: [],
  card: DEFAULT_CONTACT_SETTINGS.cards.b2c,
};

/** La vitrine qu'un visiteur regarde : celle des particuliers, ou la vitrine pro. */
export type ContactShowcase = 'public' | 'pro';

/** Les lecteurs anonymes : la route publique, sans ou avec `?audience=pro`. */
const VISITOR = 'visiteur';
const PRO_VISITOR = 'visiteur-pro';

/**
 * **La carte de contact réglée au back-office, pour qui regarde** — UNE carte
 * et ses numéros (Hugo, 2026-11-01 : « chaque audience n'a le droit qu'à son
 * information » ; `documentation/demandes-client/demandes-clients.md`, §4).
 *
 * Un visiteur lit `GET /contact-settings` (particuliers) ou, sur la vitrine
 * pro, `GET /contact-settings?audience=pro` ; un client connecté lit
 * `GET /me/contact-settings`, la carte de son audience établie au serveur.
 * Comme `ServicePoints`, la carte se vide et se relit au changement de
 * lecteur (connexion, déconnexion, bascule d'espace) : celle de l'ancien ne
 * se montre pas au nouveau, même le temps d'une requête.
 *
 * Tant que la carte n'est pas lue, ou si sa lecture échoue, elle vaut son
 * défaut TOUT VIDE : l'écran garde alors les textes du dictionnaire.
 */
@Injectable({ providedIn: 'root' })
export class ContactSettingsStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);

  private readonly held = signal<AudienceContactSettingsView>(NO_CONTACT_SETTINGS);
  private readonly showcase = signal<ContactShowcase>('public');
  /** Le lecteur dont {@link held} est la réponse — ou celle qu'on attend. */
  private readFor: string | null = null;
  private asked = false;

  readonly settings = this.held.asReadonly();

  /** {@link VISITOR}, {@link PRO_VISITOR}, l'espace reconnu, ou `null` tant qu'il n'est pas connu. */
  private readonly readerKey = computed<string | null>(() => {
    if (this.auth.isAuthenticated()) {
      return this.workspace.current();
    }
    return this.showcase() === 'pro' ? PRO_VISITOR : VISITOR;
  });

  constructor() {
    // Le lecteur change : la carte se relit, mais seulement si quelqu'un l'a demandée.
    effect(() => {
      const reader = this.readerKey();
      if (this.asked) {
        untracked(() => void this.read(reader));
      }
    });
  }

  /**
   * Lit la carte de qui regarde. `showcase` choisit la vitrine d'un VISITEUR
   * (sans lui, celle déjà demandée) ; un client connecté lit toujours la sienne.
   */
  async hydrate(showcase?: ContactShowcase): Promise<void> {
    if (showcase !== undefined) {
      this.showcase.set(showcase);
    }
    this.asked = true;
    await this.read(this.readerKey());
  }

  /** Lit pour ce lecteur, sauf si c'est déjà fait. Un échec vide, et permet de relire. */
  private async read(reader: string | null): Promise<void> {
    if (reader === this.readFor) {
      return;
    }
    this.readFor = reader;
    this.held.set(NO_CONTACT_SETTINGS);
    if (reader === null) {
      return;
    }
    try {
      const served = await this.settingsOf(reader);
      if (this.readFor === reader) {
        this.held.set(served);
      }
    } catch {
      if (this.readFor === reader) {
        this.readFor = null;
      }
    }
  }

  private settingsOf(reader: string): Promise<AudienceContactSettingsView> {
    const base = AUTH_CONFIG.apiBaseUrl;
    if (reader === VISITOR || reader === PRO_VISITOR) {
      const query = reader === PRO_VISITOR ? '?audience=pro' : '';
      return firstValueFrom(
        this.http.get<AudienceContactSettingsView>(`${base}/contact-settings${query}`),
      );
    }
    return firstValueFrom(
      this.auth.accessToken$().pipe(
        switchMap((token) =>
          this.http.get<AudienceContactSettingsView>(`${base}/me/contact-settings`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ),
      ),
    );
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
 * Les numéros servis pour la carte, dans l'ordre réglé, libellés dans la
 * langue de l'écran — aucun si la carte coupe le numéro (« Afficher le numéro
 * de téléphone », 2026-10-26). Le serveur ne sert que ceux de l'audience
 * (`both` compris) : la boutique ne trie plus par public. Aucun → liste VIDE, et l'écran ne montre pas de numéro :
 * le numéro de repli a été retiré parce qu'il affichait une information fausse
 * (décision de Hugo, 2026-10-26 — « on ne peut plus afficher une information
 * fausse »).
 */
export function phonesFor(
  settings: AudienceContactSettingsView,
  locale: LocaleCode,
): readonly ShownPhone[] {
  if (!settings.card.showPhone) {
    return [];
  }
  return settings.phones
    .map((phone) => ({ label: localizedOr(phone.label, locale, ''), number: phone.number.trim() }))
    .filter((phone) => phone.number !== '');
}

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
 * **Ce que la carte servie offre** (décision de Hugo, 2026-10-26) : ses
 * numéros, ses deux mots de bouton (le réglage, sinon le dictionnaire), et son
 * message quand elle n'offre rien. Aucun repli pour ce message : vide, rien.
 */
export function contactFor(
  settings: AudienceContactSettingsView,
  locale: LocaleCode,
  words: ContactWords,
): ShownContact {
  const { card } = settings;
  const phones = phonesFor(settings, locale);
  const canWrite = card.showForm;
  const silent = phones.length === 0 && !canWrite;
  return {
    phones,
    call: localizedOr(card.callLabel, locale, words.call),
    write: localizedOr(card.writeLabel, locale, words.write),
    canWrite,
    noContact: silent ? localizedOr(card.noContactMessage, locale, '') : '',
  };
}
