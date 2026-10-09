import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { ContactPhoneView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { CONTACT_AUDIENCE_LABELS } from '../contact-audience';
import {
  ContactPhoneDialog,
  type ContactPhoneDialogData,
  type ContactPhoneDialogResult,
} from '../contact-phone-dialog/contact-phone-dialog';

/**
 * **Les numéros de la carte de contact** — plusieurs, chacun nommé (une
 * boutique, un service) et montré à un public (Hugo, 2026-10-09).
 *
 * La liste vient du parent, qui la partage avec l'aperçu ; ce bloc ouvre le
 * dialogue et prévient le parent de relire après un succès.
 */
@Component({
  selector: 'app-contact-phones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
  ],
  templateUrl: './contact-phones.html',
  styleUrl: './contact-phones.scss',
})
export class ContactPhones {
  readonly phones = input.required<readonly ContactPhoneView[]>();
  readonly canWrite = input.required<boolean>();
  /** Un numéro a été écrit ou archivé : le parent relit. */
  readonly changed = output();

  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  protected readonly audienceLabels = CONTACT_AUDIENCE_LABELS;
  /** Dans l'ordre où la boutique les affiche. */
  protected readonly rows = computed(() =>
    [...this.phones()].sort((a, b) => a.position - b.position),
  );

  protected add(): Promise<void> {
    return this.open({ nextPosition: this.nextPosition(), canWrite: this.canWrite() });
  }

  protected openPhone(phone: ContactPhoneView): Promise<void> {
    return this.open({ phone, nextPosition: this.nextPosition(), canWrite: this.canWrite() });
  }

  private nextPosition(): number {
    return this.phones().reduce((max, p) => Math.max(max, p.position + 1), 0);
  }

  private async open(data: ContactPhoneDialogData): Promise<void> {
    const ref = this.panels.open<ContactPhoneDialogData, ContactPhoneDialogResult>(
      ContactPhoneDialog,
      { data },
    );
    const result = await ref.closed;
    if (result === undefined) return;
    if (result === 'archived') this.notify.success('Numéro archivé.');
    else this.notify.success(data.phone === undefined ? 'Numéro ajouté.' : 'Numéro mis à jour.');
    this.changed.emit();
  }
}
