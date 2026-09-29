import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type {
  ContentLocale,
  LegalDocumentParagraph,
  LegalDocumentParagraphPayload,
  LegalDocumentProse,
} from '@lfd/contracts';
import { legalSectionLabels, sectionAnchor } from '@lfd/contracts/content-values';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { LEGAL_SECTION_REASONS } from '../legal-section-reasons';

const EMPTY_PROSE: LegalDocumentProse = { title: '', body: '' };

/**
 * **Un article du document**, dans la langue affichée : le lire, le corriger,
 * le déplacer, le retirer.
 *
 * Un article qui porte une **section requise** (plan
 * `legal/plan-page-confidentialite.md` §4.2) le montre — badge « Requis » et
 * ancre publique — et n'a PAS de bouton Supprimer : le serveur le refuserait,
 * et un bouton qui mène toujours à un refus est un piège. Il se corrige et se
 * déplace comme les autres.
 *
 * Le brouillon de correction vit ici : une relecture du document (après un
 * refus pour révision périmée) ne l'efface pas, tant que la page garde la
 * carte en mode édition.
 */
@Component({
  selector: 'app-legal-paragraph-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './legal-paragraph-card.html',
  styleUrl: './legal-paragraph-card.scss',
})
export class LegalParagraphCard {
  readonly paragraph = input.required<LegalDocumentParagraph>();
  /** Le rang de lecture, à partir de zéro. */
  readonly index = input.required<number>();
  readonly first = input(false);
  readonly last = input(false);
  readonly locale = input.required<ContentLocale>();
  readonly busy = input(false);
  /** Tenu par la page : un changement de langue referme la saisie. */
  readonly editing = input(false);

  readonly moved = output<number>();
  readonly removed = output();
  readonly editStarted = output();
  readonly editCancelled = output();
  /** L'article ENTIER : la langue affichée depuis la saisie, les deux autres intactes. */
  readonly saved = output<LegalDocumentParagraphPayload>();

  protected readonly draft = signal<LegalDocumentProse>(EMPTY_PROSE);

  protected readonly prose = computed(() => this.paragraph()[this.locale()]);

  protected readonly heading = computed(() => `${this.index() + 1}. ${this.prose().title}`);

  /** La section requise que porte l'article, nommée et ancrée — ou rien. */
  protected readonly section = computed(() => {
    const key = this.paragraph().section;
    return key === undefined
      ? null
      : {
          label: `Requis — ${legalSectionLabels[key]}`,
          anchor: `#${sectionAnchor(key)}`,
          reason: LEGAL_SECTION_REASONS[key],
        };
  });

  protected readonly complete = computed(
    () => this.draft().title.trim().length > 0 && this.draft().body.trim().length > 0,
  );

  protected startEdit(): void {
    this.draft.set(this.prose());
    this.editStarted.emit();
  }

  protected setDraft(field: keyof LegalDocumentProse, value: string): void {
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  /** Réécrit l'article entier — la route remplace, omettre une langue l'effacerait. */
  protected save(): void {
    const paragraph = this.paragraph();
    this.saved.emit({
      fr: paragraph.fr,
      en: paragraph.en,
      it: paragraph.it,
      [this.locale()]: this.draft(),
    });
  }
}
