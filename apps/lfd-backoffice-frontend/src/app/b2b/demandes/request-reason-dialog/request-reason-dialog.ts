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
  type ContactAudience,
  type RequestKind,
  type RequestPriority,
  type RequestReasonPayload,
  type RequestReasonView,
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

import { CONTACT_AUDIENCE_OPTIONS } from '../../contact/contact-audience';
import { REQUEST_PRIORITY_OPTIONS } from '../request-priority';
import {
  contactLangOf,
  langName,
  langToggleOptions,
  localizedOr,
  type ContactLang,
} from '../../contact/contact-langs';
import { RequestReasonsService } from '../request-reasons.service';

/** Ajouter (`reason` absent) ou corriger un motif ; en lecture seule sans le droit d'écrire. */
export interface RequestReasonDialogData {
  /** Le type de demande du motif — celui de l'onglet ; immuable en correction. */
  readonly kind: RequestKind;
  readonly reason?: RequestReasonView;
  /** Le rang proposé à un nouveau motif : après le dernier. */
  readonly nextPosition: number;
  readonly canWrite: boolean;
}

/** Ce que le dialogue rend en se fermant sur un succès. */
export type RequestReasonDialogResult = 'saved' | 'archived';

/** Le mot de la liste, dans la langue de la boutique (aperçu seulement). */
const REASON_WORD: Readonly<Record<ContactLang, string>> = {
  fr: 'Motif',
  en: 'Reason',
  it: 'Motivo',
};

/** Une forme d'adresse e-mail, dite avant l'envoi ; le domaine reste juge. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * **Saisir un motif de demande** — ce que le client choisit en écrivant ou en
 * signalant un problème, et l'adresse où sa demande part par e-mail.
 *
 * Le `kind` vient de l'onglet qui ouvre le dialogue, et la correction le
 * reprend tel quel : le serveur refuse qu'il change.
 *
 * Le dialogue écrit lui-même et ne se ferme que sur un succès : un refus du
 * serveur reste affiché, dialogue ouvert. L'archivage vit dans la zone de
 * danger, en correction seulement — un motif archivé n'est plus proposé, les
 * demandes déjà reçues gardent son libellé figé.
 */
@Component({
  selector: 'app-request-reason-dialog',
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
  templateUrl: './request-reason-dialog.html',
  styleUrl: './request-reason-dialog.scss',
})
export class RequestReasonDialog implements FoldPanelContent<RequestReasonDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<RequestReasonDialogData>();

  private readonly api = inject(RequestReasonsService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly labelFr = signal('');
  protected readonly labelEn = signal('');
  protected readonly labelIt = signal('');
  protected readonly recipientEmail = signal('');
  protected readonly audience = signal<ContactAudience>('both');
  protected readonly active = signal(true);
  /** Usage interne : l'ordre de la messagerie, jamais montré au visiteur. */
  protected readonly priority = signal<RequestPriority>('medium');
  protected readonly priorityOptions = REQUEST_PRIORITY_OPTIONS;
  protected readonly position = signal<number | null>(0);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly audienceOptions = CONTACT_AUDIENCE_OPTIONS;
  /** La langue du libellé montrée ; une seule à la fois. */
  protected readonly lang = signal<ContactLang>('fr');

  /** FR / EN / IT : le français manquant bloque (rouge), une traduction manquante prévient. */
  protected readonly langOptions = computed(() =>
    langToggleOptions({
      ...(this.labelFr().trim() === '' ? { fr: 'alert' as const } : {}),
      ...(this.labelEn().trim() === '' ? { en: 'warning' as const } : {}),
      ...(this.labelIt().trim() === '' ? { it: 'warning' as const } : {}),
    }),
  );

  protected readonly labelTitle = computed(() => `Libellé en ${langName(this.lang())}`);
  protected readonly labelHint = computed(() =>
    this.lang() === 'fr'
      ? 'Obligatoire : c’est aussi le libellé des autres langues tant qu’elles sont vides.'
      : 'Vide : la boutique affiche le libellé français.',
  );

  protected readonly previewWord = computed(() => REASON_WORD[this.lang()]);
  /** Le libellé que la boutique affichera dans la langue montrée. */
  protected readonly previewOptions = computed(() => [
    {
      value: 'preview',
      label: localizedOr(
        { fr: this.labelFr(), en: this.labelEn(), it: this.labelIt() },
        this.lang(),
        '—',
      ),
    },
  ]);

  protected readonly isCreate = computed(() => this.data().reason === undefined);
  protected readonly readOnly = computed(() => !this.data().canWrite);
  protected readonly title = computed(() => {
    if (this.isCreate()) return 'Ajouter un motif';
    return this.readOnly() ? 'Motif' : 'Corriger le motif';
  });

  /** Ce qui partirait, ou `null` tant que la saisie n'est pas envoyable. */
  private readonly payload = computed<RequestReasonPayload | null>(() => {
    const position = this.position();
    if (position === null || !Number.isInteger(position) || position < 0) return null;
    return {
      kind: this.data().kind,
      label: { fr: this.labelFr().trim(), en: this.labelEn().trim(), it: this.labelIt().trim() },
      recipientEmail: this.recipientEmail().trim(),
      position,
      active: this.active(),
      audience: this.audience(),
      priority: this.priority(),
    };
  });

  /** Ce qui empêche l'envoi, en clair — ou `''`. */
  protected readonly issue = computed(() => {
    const max = CONTACT_BOUNDS.reasonLabel;
    const fr = this.labelFr().trim();
    if (fr === '') return 'Le libellé français est obligatoire.';
    for (const text of [fr, this.labelEn().trim(), this.labelIt().trim()]) {
      if (text.length > max) return `Libellé trop long (${String(max)} caractères au plus).`;
    }
    const email = this.recipientEmail().trim();
    if (email === '') return "Saisissez l'adresse de destination.";
    if (email.length > CONTACT_BOUNDS.recipientEmail || !EMAIL_SHAPE.test(email)) {
      return "L'adresse de destination n'est pas une adresse e-mail.";
    }
    if (this.payload() === null) return "L'ordre est un entier positif ou nul.";
    return '';
  });

  /**
   * Le refus dit à l'écran : pas sur un formulaire neuf encore vierge, où il
   * accuserait d'une faute qu'on n'a pas eu le temps de commettre.
   */
  protected readonly shownIssue = computed(() => {
    const pristine = this.isCreate() && this.labelFr() === '' && this.recipientEmail() === '';
    return this.readOnly() || pristine ? '' : this.issue();
  });

  /** En correction, rien n'a changé : Enregistrer n'a rien à écrire. */
  private readonly unchanged = computed(() => {
    const reason = this.data().reason;
    const payload = this.payload();
    return (
      reason !== undefined &&
      payload !== null &&
      reason.label.fr === payload.label.fr &&
      reason.label.en === payload.label.en &&
      reason.label.it === payload.label.it &&
      reason.recipientEmail === payload.recipientEmail &&
      reason.position === payload.position &&
      reason.active === payload.active &&
      reason.audience === payload.audience &&
      reason.priority === payload.priority
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
        const reason = data.reason;
        this.labelFr.set(reason?.label.fr ?? '');
        this.labelEn.set(reason?.label.en ?? '');
        this.labelIt.set(reason?.label.it ?? '');
        this.recipientEmail.set(reason?.recipientEmail ?? '');
        this.audience.set(reason?.audience ?? 'both');
        this.active.set(reason?.active ?? true);
        this.priority.set(reason?.priority ?? 'medium');
        this.position.set(reason?.position ?? data.nextPosition);
      });
    });
  }

  protected selectLang(value: string): void {
    const lang = contactLangOf(value);
    if (lang !== null) this.lang.set(lang);
  }

  protected labelOf(lang: ContactLang): string {
    if (lang === 'fr') return this.labelFr();
    return lang === 'en' ? this.labelEn() : this.labelIt();
  }

  protected setLabel(value: string): void {
    const lang = this.lang();
    if (lang === 'fr') this.labelFr.set(value);
    else if (lang === 'en') this.labelEn.set(value);
    else this.labelIt.set(value);
  }

  protected async submit(): Promise<void> {
    const payload = this.payload();
    if (!this.canSubmit() || payload === null) return;
    const reason = this.data().reason;
    await this.write(
      () => (reason === undefined ? this.api.create(payload) : this.api.update(reason.id, payload)),
      'saved',
      "Le motif n'a pas pu être enregistré.",
    );
  }

  protected async archive(): Promise<void> {
    const reason = this.data().reason;
    if (reason === undefined || this.readOnly() || this.saving()) return;
    await this.write(
      () => this.api.archive(reason.id),
      'archived',
      "Le motif n'a pas pu être archivé.",
    );
  }

  protected cancel(): void {
    this.panel.close();
  }

  private async write(
    call: () => Promise<void>,
    result: RequestReasonDialogResult,
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
