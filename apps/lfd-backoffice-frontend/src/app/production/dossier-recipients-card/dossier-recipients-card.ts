import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import type { DossierRecipientView, DossierStaffCandidateView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { ProductionSettingsService } from '../production-settings.service';

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly recipients: readonly DossierRecipientView[];
      readonly candidates: readonly DossierStaffCandidateView[];
    };

/** « Prénom Nom », ou l'e-mail quand la fiche a disparu de l'annuaire. */
export function recipientName(recipient: {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}): string {
  const name = `${recipient.firstName} ${recipient.lastName}`.trim();
  return name === '' ? recipient.email || 'Fiche disparue' : name;
}

/**
 * **Le dossier du jour par e-mail** (plan
 * `documentation/production/dossier-prod-du-jour.md`, lot E2) — qui reçoit
 * le PDF à chaque arrêt du plan.
 *
 * La carte se charge seule : un échec de lecture des destinataires ne doit pas
 * masquer l'arrêt du plan ni les jours fermés. La forme est vérifiée ici, la
 * règle (adresse, doublon, fiche suspendue) par le serveur, dont le refus
 * s'affiche tel quel.
 */
@Component({
  selector: 'app-dossier-recipients-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './dossier-recipients-card.html',
  styleUrl: './dossier-recipients-card.scss',
})
export class DossierRecipientsCard implements OnInit {
  private readonly api = inject(ProductionSettingsService);

  readonly canWrite = input.required<boolean>();

  protected readonly state = signal<LoadState>({ status: 'loading' });
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly staffId = signal<string | null>(null);
  protected readonly email = signal('');
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly jobTitle = signal('');

  protected readonly recipients = computed(() => {
    const state = this.state();
    return (state.status === 'ready' ? state.recipients : []).map((recipient) => ({
      ...recipient,
      name: recipientName(recipient),
    }));
  });

  /** Le personnel qu'on peut encore inscrire : les déjà inscrits sont écartés. */
  protected readonly staffOptions = computed((): readonly FoldSelectOption<string>[] => {
    const state = this.state();
    if (state.status !== 'ready') {
      return [];
    }
    const taken = new Set(state.recipients.map((recipient) => recipient.staffUserId));
    return state.candidates
      .filter((candidate) => !taken.has(candidate.staffUserId))
      .map((candidate) => ({
        value: candidate.staffUserId,
        label: `${recipientName(candidate)} — ${candidate.email}`,
      }));
  });

  protected readonly canAddStaff = computed(
    () => this.canWrite() && !this.busy() && this.staffId() !== null,
  );

  protected readonly canAddExternal = computed(
    () =>
      this.canWrite() &&
      !this.busy() &&
      this.email().trim() !== '' &&
      this.firstName().trim() !== '' &&
      this.lastName().trim() !== '',
  );

  // Pas au constructeur : le droit d'écriture, une entrée, n'y est pas encore lu.
  ngOnInit(): void {
    void this.load();
  }

  protected retry(): void {
    void this.load();
  }

  protected async addStaff(): Promise<void> {
    const staffUserId = this.staffId();
    if (!this.canAddStaff() || staffUserId === null) {
      return;
    }
    await this.gesture(async () => {
      await this.api.addDossierRecipient({ kind: 'staff', staffUserId });
      this.staffId.set(null);
    });
  }

  protected async addExternal(): Promise<void> {
    if (!this.canAddExternal()) {
      return;
    }
    const jobTitle = this.jobTitle().trim();
    await this.gesture(async () => {
      await this.api.addDossierRecipient({
        kind: 'external',
        email: this.email().trim(),
        firstName: this.firstName().trim(),
        lastName: this.lastName().trim(),
        jobTitle: jobTitle === '' ? null : jobTitle,
      });
      this.email.set('');
      this.firstName.set('');
      this.lastName.set('');
      this.jobTitle.set('');
    });
  }

  protected async remove(id: string): Promise<void> {
    if (!this.canWrite() || this.busy()) {
      return;
    }
    await this.gesture(() => this.api.removeDossierRecipient(id));
  }

  private async gesture(run: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await run();
      await this.load();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le destinataire n’a pas pu être enregistré.'));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    if (this.state().status !== 'ready') {
      this.state.set({ status: 'loading' });
    }
    try {
      const [recipients, candidates] = await Promise.all([
        this.api.dossierRecipients(),
        this.canWrite() ? this.api.dossierStaffCandidates() : Promise.resolve([]),
      ]);
      this.state.set({ status: 'ready', recipients, candidates });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
