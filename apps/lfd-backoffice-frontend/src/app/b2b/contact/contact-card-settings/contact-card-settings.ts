import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  CONTACT_BOUNDS,
  CONTACT_CARD_DEFAULTS,
  type ContactCardText,
  type ContactPhoneView,
  type ContactSettingsPayload,
  type ContactSettingsView,
  type CustomerAudience,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldTextareaComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import {
  ContactCardPreview,
  type ContactCardPreviewText,
} from '../contact-card-preview/contact-card-preview';
import {
  CONTACT_LANGS,
  contactLangOf,
  langName,
  langToggleOptions,
  localizedOr,
  type ContactLang,
} from '../contact-langs';
import { ContactPhones } from '../contact-phones/contact-phones';
import { ContactService } from '../contact.service';
import { SHOP_CONTACT_BUTTONS } from '../shop-contact-fallback';

type LoadState = 'loading' | 'ready' | 'error';
type Part = 'kicker' | 'title' | 'body';

const AUDIENCES: readonly CustomerAudience[] = ['b2b', 'b2c'];
const AUDIENCE_LABELS: Readonly<Record<CustomerAudience, string>> = {
  b2b: 'Pros',
  b2c: 'Particuliers',
};

/**
 * Une langue où la carte n'a pas son titre ou sa phrase — la boutique y retombera.
 * Le surtitre n'y compte pas : il est facultatif (Hugo, 2026-10-09).
 */
function untranslated(card: ContactCardText, lang: ContactLang): boolean {
  return card.title[lang].trim() === '' || card.body[lang].trim() === '';
}

/** Le réglage tel qu'il partirait : la vue sans sa trace. */
function payloadOf(view: ContactSettingsView): ContactSettingsPayload {
  return { cards: view.cards };
}

/**
 * **La carte de contact de la boutique** — le numéro, et pour chaque clientèle
 * un titre et une phrase en trois langues (plan « Nous écrire », §4).
 *
 * Un champ vide n'est pas une faute : la boutique y garde le texte de son
 * dictionnaire. Le réglage part toujours ENTIER (`PUT`) ; Enregistrer ne
 * s'allume que si la saisie diffère de ce qui est servi.
 */
@Component({
  selector: 'app-contact-card-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldTextareaComponent,
    FoldViewToggleComponent,
    ContactCardPreview,
    ContactPhones,
  ],
  templateUrl: './contact-card-settings.html',
  styleUrl: './contact-card-settings.scss',
})
export class ContactCardSettings {
  private readonly permissions = inject(PermissionsStore);
  protected readonly canWrite = computed(() => this.permissions.can('b2b_contact:write'));

  private readonly api = inject(ContactService);

  /** La clientèle et la langue montrées : les champs ET l'aperçu les suivent. */
  protected readonly audience = signal<CustomerAudience>('b2b');
  protected readonly lang = signal<ContactLang>('fr');
  protected readonly state = signal<LoadState>('loading');
  /** Ce que le serveur sert ; la base de comparaison du brouillon. */
  private readonly served = signal<ContactSettingsView | null>(null);
  /** Les numéros réglés à part (`/admin/contact/phones`), lus avec la carte : l'aperçu les montre. */
  protected readonly phones = signal<readonly ContactPhoneView[]>([]);
  protected readonly draft = signal<ContactSettingsPayload | null>(null);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly updatedBy = computed(() => this.served()?.updatedBy ?? null);

  /** Ce qui empêche l'envoi, en clair — ou `''`. */
  protected readonly issue = computed(() => {
    const draft = this.draft();
    if (draft === null) return '';
    for (const audience of AUDIENCES) {
      const card: ContactCardText = draft.cards[audience];
      for (const lang of CONTACT_LANGS) {
        if (card.kicker[lang].trim().length > CONTACT_BOUNDS.cardKicker) {
          return `Surtitre trop long (${String(CONTACT_BOUNDS.cardKicker)} caractères au plus).`;
        }
        if (card.title[lang].trim().length > CONTACT_BOUNDS.cardTitle) {
          return `Titre trop long (${String(CONTACT_BOUNDS.cardTitle)} caractères au plus).`;
        }
        if (card.body[lang].trim().length > CONTACT_BOUNDS.cardBody) {
          return `Phrase trop longue (${String(CONTACT_BOUNDS.cardBody)} caractères au plus).`;
        }
      }
    }
    return '';
  });

  /** Pros / Particuliers ; un point quand une langue de cette carte n'est pas écrite. */
  protected readonly audienceOptions = computed<readonly FoldViewToggleOption[]>(() => {
    const draft = this.draft();
    return AUDIENCES.map((audience) => {
      const gap =
        draft !== null && CONTACT_LANGS.some((l) => untranslated(draft.cards[audience], l));
      return gap
        ? {
            value: audience,
            label: AUDIENCE_LABELS[audience],
            dot: 'warning' as const,
            dotLabel: 'texte manquant',
          }
        : { value: audience, label: AUDIENCE_LABELS[audience] };
    });
  });

  /** FR / EN / IT de la carte montrée ; un point sur chaque langue incomplète. */
  protected readonly langOptions = computed(() => {
    const draft = this.draft();
    const card = draft?.cards[this.audience()];
    return langToggleOptions(
      Object.fromEntries(
        CONTACT_LANGS.filter((l) => card !== undefined && untranslated(card, l)).map((l) => [
          l,
          'warning' as const,
        ]),
      ),
    );
  });

  /** Ce que dit la carte quand un champ manque, dans la langue montrée. */
  protected readonly fallbackHint = computed(() =>
    this.lang() === 'fr'
      ? 'Vide : la boutique garde son texte actuel.'
      : `Vide : la boutique affiche le français réglé, sinon son texte actuel en ${langName(this.lang())}.`,
  );

  /** La carte telle que la boutique l'affichera, pour la clientèle et la langue montrées. */
  protected readonly preview = computed<ContactCardPreviewText | null>(() => {
    const draft = this.draft();
    if (draft === null) return null;
    const audience = this.audience();
    const lang = this.lang();
    const fallback = CONTACT_CARD_DEFAULTS.cards[audience];
    const card = draft.cards[audience];
    const phones = this.phones().filter(
      (p) => p.active && (p.audience === 'both' || p.audience === audience),
    );
    const call = SHOP_CONTACT_BUTTONS.call[lang];
    return {
      // Pas de repli : sans surtitre réglé, la carte n'en a pas.
      kicker: localizedOr(card.kicker, lang, ''),
      title: localizedOr(card.title, lang, fallback.title[lang]),
      body: localizedOr(card.body, lang, fallback.body[lang]),
      calls:
        phones.length === 0
          ? [`${call} · ${CONTACT_CARD_DEFAULTS.phone}`]
          : [...phones]
              .sort((a, b) => a.position - b.position)
              .map((p) => `${call} · ${localizedOr(p.label, lang, '')} · ${p.number}`),
      write: SHOP_CONTACT_BUTTONS.write[lang],
    };
  });

  private readonly changed = computed(() => {
    const served = this.served();
    const draft = this.draft();
    return (
      served !== null &&
      draft !== null &&
      JSON.stringify(payloadOf(served)) !== JSON.stringify(this.trimmed(draft))
    );
  });

  protected readonly canSubmit = computed(
    () => this.canWrite() && this.issue() === '' && this.changed() && !this.saving(),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [settings, phones] = await Promise.all([this.api.settings(), this.api.phones()]);
      this.apply(settings);
      this.phones.set(phones);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Un numéro a changé dans son dialogue : relire la liste, la saisie de la carte reste. */
  protected async reloadPhones(): Promise<void> {
    try {
      this.phones.set(await this.api.phones());
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Les numéros n’ont pas pu être relus.'));
    }
  }

  protected selectAudience(value: string): void {
    const audience = AUDIENCES.find((a) => a === value);
    if (audience !== undefined) this.audience.set(audience);
  }

  protected selectLang(value: string): void {
    const lang = contactLangOf(value);
    if (lang !== null) this.lang.set(lang);
  }

  /** Pose un texte de la carte et de la langue montrées. */
  protected setText(part: Part, value: string): void {
    const draft = this.draft();
    if (draft === null) return;
    const audience = this.audience();
    const lang = this.lang();
    const card = draft.cards[audience];
    this.draft.set({
      ...draft,
      cards: { ...draft.cards, [audience]: { ...card, [part]: { ...card[part], [lang]: value } } },
    });
  }

  protected async submit(): Promise<void> {
    const draft = this.draft();
    if (!this.canSubmit() || draft === null) return;
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.api.updateSettings(this.trimmed(draft));
      this.apply(await this.api.settings());
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "La carte de contact n'a pas pu être enregistrée."));
    } finally {
      this.saving.set(false);
    }
  }

  private apply(view: ContactSettingsView): void {
    this.served.set(view);
    this.draft.set(payloadOf(view));
  }

  private trimmed(draft: ContactSettingsPayload): ContactSettingsPayload {
    const text = (t: ContactCardText['title']) => ({
      fr: t.fr.trim(),
      en: t.en.trim(),
      it: t.it.trim(),
    });
    const card = (c: ContactCardText): ContactCardText => ({
      kicker: text(c.kicker),
      title: text(c.title),
      body: text(c.body),
    });
    return {
      cards: { b2b: card(draft.cards.b2b), b2c: card(draft.cards.b2c) },
    };
  }
}
