import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldDangerZoneComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldListboxComponent,
  type FoldSelectItem,
} from 'fold-ng';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';

/** Le motif choisi dans la liste ; « Autre » demande un texte. */
export type DeletionReasonChoice = 'duplicate' | 'mistake' | 'other';

/** Ce que le serveur accepte au plus pour un motif (domaine : `ARCHIVE_REASON_MAX_LENGTH`). */
const REASON_MAX_LENGTH = 500;

/** Le libellé d'un motif de la liste EST le motif envoyé. */
const REASON_LABELS: Readonly<Record<Exclude<DeletionReasonChoice, 'other'>, string>> = {
  duplicate: 'Doublon',
  mistake: 'Créé par erreur',
};

/**
 * « Supprimer le compte » — la zone de danger de la fiche staff.
 *
 * Distincte de la résiliation (rail Activation) : supprimer retire des listes
 * un compte créé par erreur ou en double, qui n'a jamais commandé ; résilier
 * clôt la relation avec un client qui part. Rien n'est effacé — le compte se
 * rétablit.
 *
 * Le bouton se désarme sur ce que la fiche sait déjà (des commandes, un site,
 * un principal qui a des sites) et dit pourquoi. Le serveur décide quand même :
 * son refus s'affiche par la notification de la fiche.
 */
@Component({
  selector: 'app-account-deletion-zone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldDangerZoneComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldListboxComponent,
  ],
  templateUrl: './account-deletion-zone.html',
  styleUrl: './account-deletion-zone.scss',
})
export class AccountDeletionZone {
  readonly company = input.required<AdminCompanyDetail>();
  /** Le motif — le libellé choisi, ou le texte saisi sous « Autre ». */
  readonly archive = output<string>();

  protected readonly options: readonly FoldSelectItem<DeletionReasonChoice>[] = [
    { value: 'duplicate', label: REASON_LABELS.duplicate },
    { value: 'mistake', label: REASON_LABELS.mistake },
    { value: 'other', label: 'Autre' },
  ];

  protected readonly choice = signal<DeletionReasonChoice | null>(null);
  protected readonly otherText = signal('');

  /** Ce qui retient la suppression, en une phrase ; `null` si rien. */
  protected readonly blocker = computed<string | null>(() => {
    const company = this.company();
    if (company.hasOrders) {
      return 'Ce compte a des commandes : résiliez-le plutôt.';
    }
    if (company.parent !== null) {
      return 'Détachez d’abord ce site.';
    }
    if (company.hierarchy.subAccounts.length > 0) {
      return 'Détachez d’abord ses sites.';
    }
    return null;
  });

  /** Le motif à envoyer, ou `null` tant qu'il n'est pas complet. */
  protected readonly reason = computed<string | null>(() => {
    const choice = this.choice();
    if (choice === null) {
      return null;
    }
    if (choice !== 'other') {
      return REASON_LABELS[choice];
    }
    const text = this.otherText().trim();
    return text === '' || text.length > REASON_MAX_LENGTH ? null : text;
  });

  protected readonly tooLong = computed(() => this.otherText().trim().length > REASON_MAX_LENGTH);

  protected readonly maxLength = REASON_MAX_LENGTH;

  protected confirm(): void {
    const reason = this.reason();
    if (reason !== null && this.blocker() === null) {
      this.archive.emit(reason);
    }
  }
}
