import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ContactSubjectView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { CONTACT_AUDIENCE_LABELS } from '../contact-audience';
import { CONTACT_PRIORITY_LABELS, CONTACT_PRIORITY_VARIANTS } from '../contact-priority';
import { ContactService } from '../contact.service';
import {
  ContactSubjectDialog,
  type ContactSubjectDialogData,
  type ContactSubjectDialogResult,
} from '../contact-subject-dialog/contact-subject-dialog';

type LoadState = 'loading' | 'ready' | 'error';

/** Une ligne de la liste : l'objet, et ce qu'on en dit sous son libellé. */
interface SubjectRow {
  readonly subject: ContactSubjectView;
  readonly subtitle: string;
}

/**
 * **Contact › Formulaire de contact** — les objets que le formulaire « Nous
 * écrire » propose (`documentation/contenu-ecommerce/nous-contacter.md`, §2.1).
 *
 * Un clic sur un objet ouvre son dialogue ; qui n'a que la lecture reçoit le
 * même, sans Enregistrer ni archivage.
 */
@Component({
  selector: 'app-contact-subjects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './contact-subjects.html',
  styleUrl: './contact-subjects.scss',
})
export class ContactSubjects {
  private readonly api = inject(ContactService);
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_contact:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly priorityLabels = CONTACT_PRIORITY_LABELS;
  protected readonly priorityVariants = CONTACT_PRIORITY_VARIANTS;
  private readonly subjects = signal<readonly ContactSubjectView[]>([]);

  /** Dans l'ordre où le formulaire les propose. */
  protected readonly rows = computed<readonly SubjectRow[]>(() =>
    [...this.subjects()]
      .sort((a, b) => a.position - b.position)
      .map((subject) => ({
        subject,
        subtitle: `${CONTACT_AUDIENCE_LABELS[subject.audience]} · ${subject.recipientEmail}`,
      })),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.subjects.set(await this.api.subjects());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected add(): Promise<void> {
    return this.open({ nextPosition: this.nextPosition(), canWrite: this.canWrite() });
  }

  protected openSubject(subject: ContactSubjectView): Promise<void> {
    return this.open({ subject, nextPosition: this.nextPosition(), canWrite: this.canWrite() });
  }

  private nextPosition(): number {
    return this.subjects().reduce((max, s) => Math.max(max, s.position + 1), 0);
  }

  private async open(data: ContactSubjectDialogData): Promise<void> {
    const ref = this.panels.open<ContactSubjectDialogData, ContactSubjectDialogResult>(
      ContactSubjectDialog,
      { data },
    );
    const result = await ref.closed;
    if (result === undefined) return;
    if (result === 'archived') {
      this.notify.success('Objet archivé.');
    } else {
      this.notify.success(data.subject === undefined ? 'Objet ajouté.' : 'Objet mis à jour.');
    }
    await this.load();
  }
}
