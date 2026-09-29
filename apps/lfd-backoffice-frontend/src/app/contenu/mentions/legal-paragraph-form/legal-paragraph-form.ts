import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type {
  ContentLocale,
  LegalDocumentParagraphPayload,
  LegalDocumentProse,
} from '@lfd/contracts';
import { contentLocales } from '@lfd/contracts/content-values';
import {
  FoldButtonComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldTextareaComponent,
} from 'fold-ng';

/** Le nom PLEIN d'une langue : le formulaire nomme ce qu'il réclame. */
const LOCALE_NAMES: Readonly<Record<ContentLocale, string>> = {
  fr: 'Français',
  en: 'English',
  it: 'Italiano',
};

const EMPTY_PROSE: LegalDocumentProse = { title: '', body: '' };

/** Une charge utile vide — les trois langues, puisqu'elles n'existent qu'ensemble. */
export const EMPTY_LEGAL_PARAGRAPH: LegalDocumentParagraphPayload = {
  fr: EMPTY_PROSE,
  en: EMPTY_PROSE,
  it: EMPTY_PROSE,
};

/**
 * **La saisie d'un article dans les trois langues à la fois** — celle de
 * l'ajout libre, et celle de la création d'une section requise.
 *
 * Le brouillon vit ICI, pas dans la page : tant que le formulaire est ouvert,
 * une relecture du document (après un refus pour révision périmée) ne le
 * touche pas. C'est ce qui permet de recharger sans perdre la saisie.
 *
 * Le bouton ne s'arme qu'une fois les trois langues écrites : la règle se voit
 * dans la forme, avant tout refus du serveur.
 */
@Component({
  selector: 'app-legal-paragraph-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldFieldsetComponent, FoldInputComponent, FoldTextareaComponent],
  templateUrl: './legal-paragraph-form.html',
  styleUrl: './legal-paragraph-form.scss',
})
export class LegalParagraphForm {
  /** Le texte de départ, lu UNE fois à l'ouverture. */
  readonly initial = input<LegalDocumentParagraphPayload>(EMPTY_LEGAL_PARAGRAPH);
  readonly submitLabel = input.required<string>();
  readonly busy = input(false);

  readonly submitted = output<LegalDocumentParagraphPayload>();
  readonly cancelled = output();

  private readonly edited = signal<LegalDocumentParagraphPayload | null>(null);

  /** La saisie : le texte de départ tant que rien n'a été tapé. */
  private readonly draft = computed(() => this.edited() ?? this.initial());

  protected readonly fields = computed(() =>
    contentLocales.map((code) => ({
      code,
      name: LOCALE_NAMES[code],
      prose: this.draft()[code],
    })),
  );

  /** Les langues encore à écrire — c'est ce qui rend le refus prévisible. */
  private readonly missing = computed(() =>
    contentLocales.filter((code) => {
      const prose = this.draft()[code];
      return prose.title.trim().length === 0 || prose.body.trim().length === 0;
    }),
  );

  protected readonly complete = computed(() => this.missing().length === 0);

  /** Ce qui reste à écrire, nommé — ou l'accord quand tout y est. */
  protected readonly status = computed(() => {
    const missing = this.missing();
    if (missing.length === 0) {
      return 'Les trois langues sont écrites — l’article peut entrer au document.';
    }
    return `Encore à écrire : ${missing.map((code) => LOCALE_NAMES[code]).join(', ')}.`;
  });

  protected set(locale: ContentLocale, field: keyof LegalDocumentProse, value: string): void {
    const draft = this.draft();
    this.edited.set({ ...draft, [locale]: { ...draft[locale], [field]: value } });
  }

  protected submit(): void {
    this.submitted.emit(this.draft());
  }
}
