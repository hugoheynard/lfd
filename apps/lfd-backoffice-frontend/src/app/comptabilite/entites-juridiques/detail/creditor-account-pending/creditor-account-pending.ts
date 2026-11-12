import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { PendingCreditorAccountView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent, FoldInputComponent } from 'fold-ng';

import { PermissionsStore } from '../../../../auth/permissions.store';
import { LegalEntitiesService } from '../../../legal-entities.service';

const PARIS_INSTANT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/**
 * **La modification du compte en attente** — quatre yeux (plan
 * `plan-paiement-au-compte-par-virement.md`, T0).
 *
 * Elle dit qui a proposé, quand, et le compte proposé (quatre caractères de
 * l'IBAN, le reste en entier). Un AUTRE membre la confirme en ressaisissant
 * l'IBAN depuis le RIB de la banque : il ne le voit pas, il le recopie. Son
 * auteur ne voit pas le champ — le serveur le refuserait de toute façon, et
 * un bouton dont la seule issue est un refus ment.
 *
 * Comme les cartes de la fiche, elle **décrit** son geste et le remonte
 * (`saved`) ; la page relit, annonce et montre le refus.
 */
@Component({
  selector: 'app-creditor-account-pending',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldInputComponent],
  templateUrl: './creditor-account-pending.html',
  styleUrl: './creditor-account-pending.scss',
})
export class CreditorAccountPending {
  private readonly api = inject(LegalEntitiesService);
  private readonly permissions = inject(PermissionsStore);

  readonly entityId = input.required<string>();
  readonly pending = input.required<PendingCreditorAccountView>();
  readonly busy = input(false);

  readonly saved = output<{ readonly action: () => Promise<unknown>; readonly said: string }>();

  protected readonly ibanDraft = signal('');

  /** La personne connectée a-t-elle saisi cette modification ? Comparé par fiche. */
  protected readonly isAuthor = computed(
    () => this.permissions.identity()?.id === this.pending().proposedByStaffId,
  );

  protected readonly author = computed(() => this.pending().proposedByName ?? 'un membre du staff');

  protected readonly proposedAt = computed(() =>
    PARIS_INSTANT.format(new Date(this.pending().proposedAt)),
  );

  protected readonly address = computed(() => {
    const p = this.pending();
    return [p.line1, p.line2, `${p.postalCode} ${p.city}`, p.countryCode]
      .filter((part) => part.trim() !== '')
      .join(', ');
  });

  protected confirm(): void {
    const iban = this.ibanDraft().trim();
    if (iban === '') {
      return;
    }
    const entityId = this.entityId();
    const pendingId = this.pending().id;
    this.saved.emit({
      // Le champ ne se vide qu'après le succès : un refus laisse la saisie à corriger.
      action: async () => {
        await this.api.confirmCreditorAccount(entityId, pendingId, { iban });
        this.ibanDraft.set('');
      },
      said: 'Compte confirmé : les prochaines factures et les prochains prélèvements le portent.',
    });
  }

  protected cancel(): void {
    const entityId = this.entityId();
    const pendingId = this.pending().id;
    this.saved.emit({
      action: () => this.api.cancelPendingCreditorAccount(entityId, pendingId),
      said: 'Modification du compte annulée.',
    });
  }
}
