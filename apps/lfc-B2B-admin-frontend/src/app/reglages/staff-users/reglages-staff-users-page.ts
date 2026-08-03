import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { StaffScope, StaffUserView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { SCOPE_LABELS } from './staff-scopes';
import { StaffUserPanel, type StaffUserPanelData } from './staff-user-panel/staff-user-panel';
import { StaffUsersService } from './staff-users.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Sous-page **Utilisateurs** des Réglages (staff) — l'annuaire du back-office
 * dans une `fold-data-table` : prénom, nom, e-mail, **périmètre** (badges), plus
 * les actions par ligne (éditer / supprimer). La saisie passe par
 * `StaffUserPanel` (side-panel) ; ici on liste, on ouvre le panneau et on
 * recharge. Le provisioning de connexion (Auth0) est différé.
 */
@Component({
  selector: 'app-reglages-staff-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldButtonComponent,
    FoldBadgeComponent,
    FoldIconComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldInlineConfirmComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './reglages-staff-users-page.html',
  styleUrl: './reglages-staff-users-page.scss',
})
export class ReglagesStaffUsersPage {
  private readonly service = inject(StaffUsersService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly users = signal<readonly StaffUserView[]>([]);
  /** User dont la confirmation de suppression est ouverte (état UI local). */
  protected readonly confirmingId = signal<string | null>(null);

  /** Colonnes de la data-table — chaque `key` a son `<ng-template foldCell>`. */
  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'lastName', label: 'Nom' },
    { key: 'firstName', label: 'Prénom' },
    { key: 'email', label: 'E-mail' },
    { key: 'scopes', label: 'Périmètre' },
    { key: 'actions', label: '', width: '4rem', align: 'right' },
  ];

  protected readonly emptyState: FoldTableEmpty = {
    title: 'Aucun utilisateur',
    subtitle: 'Ajoutez les personnes qui opèrent la suite.',
  };

  protected readonly rowKey = (user: StaffUserView): string => user.id;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.users.set(await this.service.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Libellé FR d'un périmètre (pour les badges). */
  protected scopeLabel(scope: StaffScope): string {
    return SCOPE_LABELS[scope];
  }

  protected add(): void {
    void this.openPanel({ user: null });
  }

  protected edit(user: StaffUserView): void {
    void this.openPanel({ user });
  }

  /** Ouvre le panneau, puis recharge la liste si une sauvegarde a eu lieu. */
  private async openPanel(data: StaffUserPanelData): Promise<void> {
    const ref = this.panels.open<StaffUserPanelData | undefined, boolean>(StaffUserPanel, {
      data,
      width: 'md',
    });
    const saved = await ref.closed;
    if (saved === true) {
      await this.load();
    }
  }

  protected askRemove(user: StaffUserView): void {
    this.confirmingId.set(user.id);
  }

  protected async confirmRemove(user: StaffUserView): Promise<void> {
    this.confirmingId.set(null);
    try {
      await this.service.remove(user.id);
      this.notify.success('Utilisateur supprimé.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }
}
