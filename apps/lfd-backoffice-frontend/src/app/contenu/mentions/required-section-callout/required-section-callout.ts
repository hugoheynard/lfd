import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { LegalDocumentParagraphPayload, LegalSectionKey } from '@lfd/contracts';
import { legalSectionLabels } from '@lfd/contracts/content-values';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import {
  EMPTY_LEGAL_PARAGRAPH,
  LegalParagraphForm,
} from '../legal-paragraph-form/legal-paragraph-form';
import { LEGAL_SECTION_REASONS } from '../legal-section-reasons';

/** Ce que la page reçoit : la clé, et le texte saisi dans les trois langues. */
export interface RequiredSectionSubmission {
  readonly section: LegalSectionKey;
  readonly payload: LegalDocumentParagraphPayload;
}

/**
 * **Une section que la mention exige et que le document ne porte pas** (plan
 * `legal/plan-page-confidentialite.md` §4.2) : l'encadré qui le dit, et le
 * formulaire qui la crée.
 *
 * Le formulaire n'est pré-rempli que du TITRE français, tiré du libellé de la
 * section : aucun corps, aucune autre langue. Un texte juridique de départ
 * serait publié tel quel (§4.5, S3).
 *
 * Il n'a pas à se refermer après succès : la page relit, la section existe, et
 * l'encadré disparaît avec elle.
 */
@Component({
  selector: 'app-required-section-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    LegalParagraphForm,
  ],
  templateUrl: './required-section-callout.html',
})
export class RequiredSectionCallout {
  readonly section = input.required<LegalSectionKey>();
  readonly busy = input(false);

  readonly submitted = output<RequiredSectionSubmission>();

  protected readonly open = signal(false);

  protected readonly label = computed(() => legalSectionLabels[this.section()]);
  protected readonly reason = computed(() => LEGAL_SECTION_REASONS[this.section()]);

  protected readonly initial = computed<LegalDocumentParagraphPayload>(() => ({
    ...EMPTY_LEGAL_PARAGRAPH,
    fr: { title: this.label(), body: '' },
  }));

  protected submit(payload: LegalDocumentParagraphPayload): void {
    this.submitted.emit({ section: this.section(), payload });
  }
}
