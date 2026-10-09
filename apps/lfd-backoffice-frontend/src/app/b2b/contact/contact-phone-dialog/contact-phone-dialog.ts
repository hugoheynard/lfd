import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  CONTACT_BOUNDS,
  type ContactPhonePayload,
  type ContactPhoneView,
  type ContactAudience,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldDangerZoneComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldViewToggleComponent,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { CONTACT_AUDIENCE_OPTIONS } from '../contact-audience';
import { contactLangOf, langName, langToggleOptions, type ContactLang } from '../contact-langs';
import { ContactService } from '../contact.service';

/** Ajouter (`phone` absent) ou corriger un numéro ; en lecture seule sans le droit d'écrire. */
export interface ContactPhoneDialogData {
  readonly phone?: ContactPhoneView;
  /** Le rang proposé à un nouveau numéro : après le dernier. */
  readonly nextPosition: number;
  readonly canWrite: boolean;
}

/** Ce que le dialogue rend en se fermant sur un succès. */
export type ContactPhoneDialogResult = 'saved' | 'archived';

/**
 * **Saisir un numéro de contact** — ce qu'il désigne (« Boutique de Val
 * d'Isère », « Service commercial »), le numéro, et à qui la boutique le montre
 * (Hugo, 2026-10-09).
 *
 * Même motif que le dialogue d'objet : une langue à la fois, un point sur ce
 * qui manque, un refus du serveur affiché dialogue ouvert, l'archivage en zone
 * de danger. Le numéro n'est pas normalisé ici : le serveur fait foi.
 */
@Component({
  selector: 'app-contact-phone-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldDangerZoneComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './contact-phone-dialog.html',
  styleUrl: './contact-phone-dialog.scss',
})
export class ContactPhoneDialog implements FoldPanelContent<ContactPhoneDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<ContactPhoneDialogData>();

  private readonly api = inject(ContactService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly labels = signal<Record<ContactLang, string>>({ fr: '', en: '', it: '' });
  protected readonly number = signal('');
  protected readonly audience = signal<ContactAudience>('both');
  protected readonly active = signal(true);
  protected readonly position = signal<number | null>(0);
  protected readonly lang = signal<ContactLang>('fr');
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly audienceOptions = CONTACT_AUDIENCE_OPTIONS;

  protected readonly isCreate = computed(() => this.data().phone === undefined);
  protected readonly readOnly = computed(() => !this.data().canWrite);
  protected readonly title = computed(() => {
    if (this.isCreate()) return 'Ajouter un numéro';
    return this.readOnly() ? 'Numéro de contact' : 'Corriger le numéro';
  });

  /** FR / EN / IT : le français manquant bloque (rouge), une traduction manquante prévient. */
  protected readonly langOptions = computed(() => {
    const labels = this.labels();
    return langToggleOptions({
      ...(labels.fr.trim() === '' ? { fr: 'alert' as const } : {}),
      ...(labels.en.trim() === '' ? { en: 'warning' as const } : {}),
      ...(labels.it.trim() === '' ? { it: 'warning' as const } : {}),
    });
  });
  protected readonly labelTitle = computed(() => `Libellé en ${langName(this.lang())}`);
  protected readonly labelHint = computed(() =>
    this.lang() === 'fr'
      ? 'Obligatoire : ce que le numéro désigne — une boutique, un service.'
      : 'Vide : la boutique affiche le libellé français.',
  );

  /** Ce qui partirait, ou `null` tant que l'ordre n'est pas un entier positif. */
  private readonly payload = computed<ContactPhonePayload | null>(() => {
    const position = this.position();
    if (position === null || !Number.isInteger(position) || position < 0) return null;
    const labels = this.labels();
    return {
      label: { fr: labels.fr.trim(), en: labels.en.trim(), it: labels.it.trim() },
      number: this.number().trim(),
      audience: this.audience(),
      position,
      active: this.active(),
    };
  });

  /** Ce qui empêche l'envoi, en clair — ou `''`. */
  protected readonly issue = computed(() => {
    const labels = this.labels();
    const max = CONTACT_BOUNDS.phoneLabel;
    if (labels.fr.trim() === '') return 'Le libellé français est obligatoire.';
    for (const text of [labels.fr, labels.en, labels.it]) {
      if (text.trim().length > max) return `Libellé trop long (${String(max)} caractères au plus).`;
    }
    const number = this.number().trim();
    if (number === '') return 'Saisissez le numéro.';
    if (number.length > CONTACT_BOUNDS.settingsPhone) {
      return `Numéro trop long (${String(CONTACT_BOUNDS.settingsPhone)} caractères au plus).`;
    }
    if (this.payload() === null) return "L'ordre est un entier positif ou nul.";
    return '';
  });

  /** Pas sur un formulaire neuf encore vierge : il accuserait d'une faute pas encore commise. */
  protected readonly shownIssue = computed(() => {
    const pristine = this.isCreate() && this.labels().fr === '' && this.number() === '';
    return this.readOnly() || pristine ? '' : this.issue();
  });

  private readonly unchanged = computed(() => {
    const phone = this.data().phone;
    const payload = this.payload();
    return (
      phone !== undefined &&
      payload !== null &&
      JSON.stringify([phone.label.fr, phone.label.en, phone.label.it]) ===
        JSON.stringify([payload.label.fr, payload.label.en, payload.label.it]) &&
      phone.number === payload.number &&
      phone.audience === payload.audience &&
      phone.position === payload.position &&
      phone.active === payload.active
    );
  });

  protected readonly canSubmit = computed(
    () => !this.readOnly() && this.issue() === '' && !this.unchanged() && !this.saving(),
  );

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const data = this.data();
      untracked(() => {
        const phone = data.phone;
        this.labels.set({
          fr: phone?.label.fr ?? '',
          en: phone?.label.en ?? '',
          it: phone?.label.it ?? '',
        });
        this.number.set(phone?.number ?? '');
        this.audience.set(phone?.audience ?? 'both');
        this.active.set(phone?.active ?? true);
        this.position.set(phone?.position ?? data.nextPosition);
      });
    });
  }

  protected selectLang(value: string): void {
    const lang = contactLangOf(value);
    if (lang !== null) this.lang.set(lang);
  }

  protected setLabel(value: string): void {
    this.labels.set({ ...this.labels(), [this.lang()]: value });
  }

  protected async submit(): Promise<void> {
    const payload = this.payload();
    if (!this.canSubmit() || payload === null) return;
    const phone = this.data().phone;
    await this.write(
      () =>
        phone === undefined
          ? this.api.createPhone(payload)
          : this.api.updatePhone(phone.id, payload),
      'saved',
      "Le numéro n'a pas pu être enregistré.",
    );
  }

  protected async archive(): Promise<void> {
    const phone = this.data().phone;
    if (phone === undefined || this.readOnly() || this.saving()) return;
    await this.write(
      () => this.api.archivePhone(phone.id),
      'archived',
      "Le numéro n'a pas pu être archivé.",
    );
  }

  protected cancel(): void {
    this.panel.close();
  }

  private async write(
    call: () => Promise<void>,
    result: ContactPhoneDialogResult,
    fallback: string,
  ): Promise<void> {
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await call();
      this.panel.close(result);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, fallback));
    } finally {
      this.saving.set(false);
    }
  }
}
