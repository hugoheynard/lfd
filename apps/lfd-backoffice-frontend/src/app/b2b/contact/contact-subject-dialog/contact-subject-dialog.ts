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
  type ContactPriority,
  type ContactSubjectAudience,
  type ContactSubjectPayload,
  type ContactSubjectView,
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
import { CONTACT_PRIORITY_OPTIONS } from '../contact-priority';
import {
  contactLangOf,
  langName,
  langToggleOptions,
  localizedOr,
  type ContactLang,
} from '../contact-langs';
import { ContactService } from '../contact.service';

/** Ajouter (`subject` absent) ou corriger un objet ; en lecture seule sans le droit d'écrire. */
export interface ContactSubjectDialogData {
  readonly subject?: ContactSubjectView;
  /** Le rang proposé à un nouvel objet : après le dernier. */
  readonly nextPosition: number;
  readonly canWrite: boolean;
}

/** Ce que le dialogue rend en se fermant sur un succès. */
export type ContactSubjectDialogResult = 'saved' | 'archived';

/** Le mot de la liste, dans la langue de la boutique (aperçu seulement). */
const SUBJECT_WORD: Readonly<Record<ContactLang, string>> = {
  fr: 'Objet',
  en: 'Subject',
  it: 'Oggetto',
};

/** Une forme d'adresse e-mail, dite avant l'envoi ; le domaine reste juge. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * **Saisir un objet de contact** — ce que le visiteur choisit en écrivant, et
 * l'adresse où son message part.
 *
 * Le dialogue écrit lui-même et ne se ferme que sur un succès : un refus du
 * serveur reste affiché, dialogue ouvert. L'archivage vit dans la zone de
 * danger, en correction seulement — un objet archivé n'est plus proposé, les
 * messages déjà reçus gardent son libellé figé.
 */
@Component({
  selector: 'app-contact-subject-dialog',
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
  templateUrl: './contact-subject-dialog.html',
  styleUrl: './contact-subject-dialog.scss',
})
export class ContactSubjectDialog implements FoldPanelContent<ContactSubjectDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<ContactSubjectDialogData>();

  private readonly api = inject(ContactService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly labelFr = signal('');
  protected readonly labelEn = signal('');
  protected readonly labelIt = signal('');
  protected readonly recipientEmail = signal('');
  protected readonly audience = signal<ContactSubjectAudience>('both');
  protected readonly active = signal(true);
  /** Usage interne : l'ordre de la messagerie, jamais montré au visiteur. */
  protected readonly priority = signal<ContactPriority>('medium');
  protected readonly priorityOptions = CONTACT_PRIORITY_OPTIONS;
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

  protected readonly previewWord = computed(() => SUBJECT_WORD[this.lang()]);
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

  protected readonly isCreate = computed(() => this.data().subject === undefined);
  protected readonly readOnly = computed(() => !this.data().canWrite);
  protected readonly title = computed(() => {
    if (this.isCreate()) return 'Ajouter un objet';
    return this.readOnly() ? 'Objet de contact' : "Corriger l'objet";
  });

  /** Ce qui partirait, ou `null` tant que la saisie n'est pas envoyable. */
  private readonly payload = computed<ContactSubjectPayload | null>(() => {
    const position = this.position();
    if (position === null || !Number.isInteger(position) || position < 0) return null;
    return {
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
    const max = CONTACT_BOUNDS.subjectLabel;
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
    const subject = this.data().subject;
    const payload = this.payload();
    return (
      subject !== undefined &&
      payload !== null &&
      subject.label.fr === payload.label.fr &&
      subject.label.en === payload.label.en &&
      subject.label.it === payload.label.it &&
      subject.recipientEmail === payload.recipientEmail &&
      subject.position === payload.position &&
      subject.active === payload.active &&
      subject.audience === payload.audience &&
      subject.priority === payload.priority
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
        const subject = data.subject;
        this.labelFr.set(subject?.label.fr ?? '');
        this.labelEn.set(subject?.label.en ?? '');
        this.labelIt.set(subject?.label.it ?? '');
        this.recipientEmail.set(subject?.recipientEmail ?? '');
        this.audience.set(subject?.audience ?? 'both');
        this.active.set(subject?.active ?? true);
        this.priority.set(subject?.priority ?? 'medium');
        this.position.set(subject?.position ?? data.nextPosition);
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
    const subject = this.data().subject;
    await this.write(
      () =>
        subject === undefined
          ? this.api.createSubject(payload)
          : this.api.updateSubject(subject.id, payload),
      'saved',
      "L'objet n'a pas pu être enregistré.",
    );
  }

  protected async archive(): Promise<void> {
    const subject = this.data().subject;
    if (subject === undefined || this.readOnly() || this.saving()) return;
    await this.write(
      () => this.api.archiveSubject(subject.id),
      'archived',
      "L'objet n'a pas pu être archivé.",
    );
  }

  protected cancel(): void {
    this.panel.close();
  }

  private async write(
    call: () => Promise<void>,
    result: ContactSubjectDialogResult,
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
