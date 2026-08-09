import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldBadgeComponent, FoldEmptyStateComponent, FoldIconComponent } from 'fold-ng';

import {
  STATUS_LABELS,
  type AdminCompany,
  type CompanyStatus,
} from '../../../comptes-clients/admin-company';

/** Ton du statut — la carte se lit à la couleur avant de se lire au texte. */
type BadgeVariant = 'neutral' | 'accent' | 'info' | 'warning' | 'alert' | 'success';

const STATUS_VARIANT: Record<CompanyStatus, BadgeVariant> = {
  pending: 'warning',
  active: 'success',
  suspended: 'alert',
  terminated: 'neutral',
};

/**
 * Les **comptes épinglés** — les clients qu'on suit de près, en tête de tableau
 * de bord.
 *
 * Présentationnel : la page possède la liste et le magasin. Ce composant affiche
 * et remonte le désépinglage.
 *
 * Ce qu'une carte montre, et rien d'autre : le nom, l'état du compte, et le
 * signal qui appelle une action (une demande de rappel ouverte). Un épinglage
 * sert à décider s'il faut ouvrir la fiche — pas à remplacer la fiche.
 */
@Component({
  selector: 'app-pinned-accounts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldEmptyStateComponent, FoldIconComponent, RouterLink],
  templateUrl: './pinned-accounts.html',
  styleUrl: './pinned-accounts.scss',
})
export class PinnedAccounts {
  readonly companies = input.required<readonly AdminCompany[]>();
  /** Le commercial retire une épingle. */
  readonly unpinned = output<string>();

  protected readonly cards = computed(() =>
    this.companies().map((company) => ({
      company,
      status: STATUS_LABELS[company.status],
      variant: STATUS_VARIANT[company.status],
    })),
  );

  protected unpin(event: Event, companyId: string): void {
    // La carte est un lien : retirer l'épingle ne doit pas ouvrir la fiche.
    event.preventDefault();
    event.stopPropagation();
    this.unpinned.emit(companyId);
  }
}
