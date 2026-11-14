import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  COMPANY_CONTACT_MODES,
  type CompanyContactMode,
  type NoteCompanyContactPayload,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldListboxComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
  type FoldPanelContent,
  type FoldPanelDefaults,
  type FoldSelectItem,
} from 'fold-ng';

import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../../notify.service';
import { GestureIntents } from '../../../shared/gesture-intents';
import { parisToday } from '../../../shared/paris-today';

/** La société dont on note l'échange. */
export interface NoteContactPanelData {
  readonly companyId: string;
  readonly companyName: string;
}

/** La longueur que le domaine admet pour la note (`plan-suivi-commercial.md`, § 3.2 ter). */
export const NOTE_MAX_LENGTH = 280;

export const CONTACT_MODE_LABELS: Readonly<Record<CompanyContactMode, string>> = {
  phone: 'Téléphone',
  email: 'E-mail',
  visit: 'Visite',
  visio: 'Visio',
  trade_show: 'Salon',
  other: 'Autre',
};

/**
 * **Noter un contact** — l'échange réel avec la société (mode, jour, note
 * courte) qui la fait passer « Contactée » au suivi commercial. L'auteur est
 * celui qui note : le serveur le lit sur la requête.
 *
 * Le jour est celui de Paris, aujourd'hui par défaut, jamais dans le futur ;
 * le serveur le refuse aussi, et son refus reste dans le dialogue.
 */
@Component({
  selector: 'app-note-contact-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldListboxComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './note-contact-panel.html',
  styleUrl: './note-contact-panel.scss',
})
export class NoteContactPanel implements FoldPanelContent<NoteContactPanelData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md' };

  readonly data = input<NoteContactPanelData | undefined>();

  private readonly companies = inject(AdminCompaniesService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject<FoldPanelRef<boolean>>(FoldPanelRef);
  /** Une clé par geste voulu : un double clic ne note pas deux échanges. */
  private readonly intents = new GestureIntents();

  protected readonly today = parisToday();
  protected readonly maxLength = NOTE_MAX_LENGTH;
  protected readonly modes: readonly FoldSelectItem<CompanyContactMode>[] =
    COMPANY_CONTACT_MODES.map((mode) => ({ value: mode, label: CONTACT_MODE_LABELS[mode] }));

  readonly mode = signal<CompanyContactMode | null>(null);
  readonly date = signal(this.today);
  readonly note = signal('');
  protected readonly pending = signal(false);
  readonly refusal = signal<string | null>(null);

  protected readonly noteHint = computed(
    () => `${this.note().trim().length} / ${NOTE_MAX_LENGTH} caractères`,
  );
  protected readonly dateProblem = computed<string | null>(() => {
    const date = this.date();
    if (date === '') return 'Choisissez le jour de l’échange.';
    // `AAAA-MM-JJ` se compare dans l'ordre des jours.
    return date > this.today ? 'Un échange ne se note pas dans le futur.' : null;
  });
  protected readonly noteTooLong = computed(() => this.note().trim().length > NOTE_MAX_LENGTH);

  /** Le corps de la demande, ou `null` tant que le formulaire ne la permet pas. */
  readonly payload = computed<NoteCompanyContactPayload | null>(() => {
    const mode = this.mode();
    if (mode === null || this.dateProblem() !== null || this.noteTooLong()) return null;
    const note = this.note().trim();
    return note === '' ? { mode, date: this.date() } : { mode, date: this.date(), note };
  });

  protected cancel(): void {
    this.ref.close(false);
  }

  async submit(): Promise<void> {
    const opened = this.data();
    const payload = this.payload();
    if (opened === undefined || payload === null || this.pending()) return;
    this.pending.set(true);
    this.refusal.set(null);
    try {
      await this.companies.noteContact(
        opened.companyId,
        payload,
        this.intents.keyFor(opened.companyId),
      );
      this.intents.done(opened.companyId);
      this.notify.success(`Contact noté pour ${opened.companyName}.`);
      this.ref.close(true);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le contact n’a pas été noté.'));
    } finally {
      this.pending.set(false);
    }
  }
}
