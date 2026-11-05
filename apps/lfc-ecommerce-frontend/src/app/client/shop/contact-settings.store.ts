import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
// Valeurs par le sous-chemin sans zod : l'accueil est au démarrage (budget `cloudflare`).
import {
  DEFAULT_CONTACT_SETTINGS,
  type AudienceContactSettingsView,
  type ContactLocalizedText,
} from '@lfd/contracts/shop-values';
import type { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientContext, VISITOR } from '../client-context.service';
import type { LocaleCode } from '../client-locale.service';
import { contextKeyed, type ContextKey, workspaceRequestOf } from '../context-keyed/context-keyed';

/** Le défaut : aucun numéro, la carte vide du contrat (la boutique garde son dictionnaire). */
export const NO_CONTACT_SETTINGS: AudienceContactSettingsView = {
  phones: [],
  card: DEFAULT_CONTACT_SETTINGS.cards.b2c,
};

/** La vitrine qu'un visiteur regarde : celle des particuliers, ou la vitrine pro. */
export type ContactShowcase = 'public' | 'pro';

/** La part propre d'une clé visiteur sur la vitrine pro : `?audience=pro`. */
const PRO_SHOWCASE = 'pro';

/**
 * **La carte de contact réglée au back-office, pour qui regarde** — UNE carte
 * et ses numéros (Hugo, 2026-11-01 : « chaque audience n'a le droit qu'à son
 * information » ; `documentation/demandes-client/demandes-clients.md`, §4).
 *
 * Un visiteur lit `GET /contact-settings` (particuliers) ou, sur la vitrine
 * pro, `GET /contact-settings?audience=pro` ; un client connecté lit
 * `GET /me/contact-settings`, la carte de son audience établie au serveur.
 *
 * Rangée par clé de contexte (lot d de `caching-usage/dans-quel-espace-est-le-client.md`) :
 * l'espace que `ClientContext` AFFICHE et, pour un visiteur, la vitrine. La
 * carte d'une autre clé ne se montre jamais, même le temps d'une requête ;
 * pendant une bascule, celle de l'espace demandé se lit d'avance et ne
 * s'affiche qu'une fois l'espace accepté.
 *
 * Tant que la carte n'est pas lue, ou si sa lecture échoue, elle vaut son
 * défaut TOUT VIDE : l'écran garde alors les textes du dictionnaire.
 */
@Injectable({ providedIn: 'root' })
export class ContactSettingsStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);

  private readonly showcase = signal<ContactShowcase>('public');
  /** Quelqu'un a-t-il demandé la carte ? Sans demande, rien ne se lit. */
  private asked = false;
  /** Avance à chaque réponse : la brique n'est pas un signal. */
  private readonly answered = signal(0);

  private readonly keyed = contextKeyed((key) => this.load(key));

  /** La clé de qui regarde, ou `null` tant que son espace n'est pas connu. */
  private readonly key = computed<ContextKey | null>(
    () => {
      const workspace = this.context.prefix();
      if (workspace === null) {
        return null;
      }
      const own = workspace === VISITOR && this.showcase() === 'pro' ? PRO_SHOWCASE : '';
      return { workspace, own };
    },
    { equal: (a, b) => a?.workspace === b?.workspace && a?.own === b?.own },
  );

  readonly settings = computed<AudienceContactSettingsView>(() => {
    this.answered();
    const key = this.key();
    return (key === null ? undefined : this.keyed.shown(key)) ?? NO_CONTACT_SETTINGS;
  });

  constructor() {
    // Le lecteur change : sa carte se lit, mais seulement si quelqu'un l'a
    // demandée. Une clé déjà lue (retour à un espace vu) ne se relit pas.
    effect(() => {
      const key = this.key();
      if (this.asked && key !== null) {
        untracked(() => void this.settle(this.keyed.ensure(key)));
      }
    });
    // Une bascule : la carte de l'espace demandé part tout de suite, comme
    // avant la brique — elle ne s'affiche qu'une fois l'espace accepté.
    effect(() => {
      const switching = this.context.switching();
      const target = this.context.ahead();
      if (switching && target !== null && this.asked) {
        untracked(() => {
          this.keyed.ahead({ workspace: target, own: '' });
        });
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
    const key = untracked(() => this.key());
    if (key !== null) {
      await this.settle(this.keyed.ensure(key));
    }
  }

  /** Un échec laisse le défaut vide, et permet de relire. */
  private async settle(reading: Promise<AudienceContactSettingsView>): Promise<void> {
    try {
      await reading;
    } catch {
      // Le défaut reste : l'écran garde les textes du dictionnaire.
    }
    this.answered.update((count) => count + 1);
  }

  /** L'appel d'une clé — son en-tête d'espace vient de la clé, pas de l'envoi. */
  private load(key: ContextKey): Observable<AudienceContactSettingsView> {
    const base = AUTH_CONFIG.apiBaseUrl;
    if (key.workspace === VISITOR) {
      const query = key.own === PRO_SHOWCASE ? '?audience=pro' : '';
      return this.http.get<AudienceContactSettingsView>(
        `${base}/contact-settings${query}`,
        workspaceRequestOf(key),
      );
    }
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<AudienceContactSettingsView>(
            `${base}/me/contact-settings`,
            workspaceRequestOf(key, { Authorization: `Bearer ${token}` }),
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
