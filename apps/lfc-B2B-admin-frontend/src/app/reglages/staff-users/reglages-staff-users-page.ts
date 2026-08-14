import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { STAFF_ROLE_LABELS, STAFF_STATUS_LABELS, type StaffUserView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowCardDirective,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInfoComponent,
  FoldInlineConfirmComponent,
  FoldPaginatorComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { CanDirective } from '../../shared/can/can.directive';
import { STATUS_VARIANT } from './staff-roles';
import { StaffUserPanel, type StaffUserPanelData } from './staff-user-panel/staff-user-panel';
import { StaffUsersService } from './staff-users.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Sous-page **Utilisateurs** des Réglages (staff) — l'annuaire du back-office
 * dans une `fold-data-table` : identité, **rôle**, état de la connexion, plus les
 * actions par ligne (éditer / inviter / suspendre / supprimer). La saisie passe
 * par `StaffUserPanel` (side-panel) ; ici on liste, on ouvre le panneau et on
 * recharge.
 */
@Component({
  selector: 'app-reglages-staff-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    FoldCardComponent,
    FoldButtonComponent,
    FoldBadgeComponent,
    FoldIconComponent,
    FoldElementTitleComponent,
    FoldInfoComponent,
    FoldPaginatorComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldDataTableRowCardDirective,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldInlineConfirmComponent,
    FoldPopoverTriggerDirective,
    CanDirective,
    FoldEmptyStateComponent,
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

  /**
   * Une page tient dans un écran sans molette. Au-delà, on pagine plutôt que
   * de dérouler : une équipe se lit, elle ne se parcourt pas.
   */
  /**
   * Le ton d'une ligne — la seule chose que la couleur a le droit de dire ici.
   *
   * Une invitation périmée et un accès suspendu ne se voient pas dans une
   * pastille qu'on lit ligne par ligne : ils se voient au premier coup d'œil
   * sur la liste entière, ou ils ne se voient pas. Le reste des lignes reste
   * neutre — teinter aussi les comptes sains ferait un arc-en-ciel où plus
   * rien ne ressort.
   */
  protected readonly rowTone = (row: StaffUserView): 'warning' | 'alert' | null => {
    if (this.isSuspended(row)) {
      return 'alert';
    }
    return row.invitationExpired ? 'warning' : null;
  };

  protected readonly pageSize = 12;
  protected readonly page = signal(1);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.users().length / this.pageSize)),
  );

  /**
   * La tranche visible. Bornée par `totalPages` : une suppression sur la
   * dernière page la ferait disparaître, et on afficherait le vide sur une
   * page qui n'existe plus.
   */
  protected readonly pageRows = computed(() => {
    const current = Math.min(this.page(), this.totalPages());
    const start = (current - 1) * this.pageSize;
    return this.users().slice(start, start + this.pageSize);
  });

  /** Colonnes de la data-table — chaque `key` a son `<ng-template foldCell>`. */
  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'lastName', label: 'Nom' },
    { key: 'firstName', label: 'Prénom' },
    { key: 'email', label: 'E-mail' },
    { key: 'jobTitle', label: 'Fonction' },
    { key: 'role', label: 'Rôle' },
    { key: 'status', label: 'Accès' },
    { key: 'actions', label: '', width: '4rem', align: 'right' },
  ];

  protected readonly emptyState: FoldTableEmpty = {
    title: 'Aucun utilisateur',
    subtitle: 'Ajoutez les personnes qui opèrent la suite.',
  };

  protected readonly rowKey = (user: StaffUserView): string => user.id;

  /**
   * Le titre de la table porte le nombre d'**actifs** — pas le total.
   *
   * C'est le seul chiffre que l'annuaire ne totalise nulle part et qui répond à
   * la vraie question : combien de personnes peuvent entrer *maintenant*. Une
   * fiche invitée, expirée ou suspendue occupe une ligne sans ouvrir de porte,
   * et compter les lignes ferait croire à un périmètre plus large qu'il n'est.
   */
  protected readonly tableTitle = computed(() => {
    const active = this.users().filter((user) => user.status === 'active').length;
    return `Utilisateurs · ${String(active)} actif${active > 1 ? 's' : ''}`;
  });

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

  // Le contexte d'un `foldCell` n'est pas typé : on entre par une méthode, qui
  // rend la ligne typée au passage — plutôt que d'indexer un Record avec `any`.
  protected roleLabel(user: StaffUserView): string {
    return STAFF_ROLE_LABELS[user.role];
  }

  /**
   * Une invitation périmée se dit **explicitement**. « Invitée » sur un lien
   * mort enverrait attendre une réponse qui ne viendra pas — et le geste utile
   * (renvoyer) resterait invisible.
   */
  protected statusLabel(user: StaffUserView): string {
    return user.invitationExpired ? 'Invitation expirée' : STAFF_STATUS_LABELS[user.status];
  }

  protected statusVariant(user: StaffUserView): 'neutral' | 'success' | 'warning' {
    return user.invitationExpired ? 'warning' : STATUS_VARIANT[user.status];
  }

  /** Jamais invitée ⇒ « Inviter » ; déjà invitée ou entrée ⇒ « Renvoyer ». */
  protected inviteLabel(user: StaffUserView): string {
    return user.invitedAt === null ? 'Inviter à créer son compte' : 'Renvoyer le lien';
  }

  /**
   * On n'invite pas une personne suspendue : le lien rouvrirait la porte que la
   * suspension a fermée. Le serveur refuse de toute façon — cacher l'entrée
   * évite d'offrir un bouton qui ne peut que produire une erreur.
   */
  protected canInvite(user: StaffUserView): boolean {
    return user.status !== 'suspended';
  }

  /** Invite, ou renvoie un lien : même geste, même appel. */
  protected async invite(user: StaffUserView): Promise<void> {
    try {
      const { mailSent } = await this.service.invite(user.id);
      // Le canal peut être muet — mailer non configuré, fournisseur en panne.
      // L'annoncer parti serait envoyer quelqu'un attendre un e-mail qui
      // n'arrivera pas ; le lien se remet alors depuis « Accès à remettre ».
      this.notify.success(
        mailSent
          ? `Lien envoyé à ${user.email}.`
          : `Accès ouvert, mais l'e-mail n'est pas parti — remettez le lien depuis « Accès à remettre ».`,
      );
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
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

  /** Suspendre ferme tout sans rien détruire ; réintégrer rouvre. */
  protected async toggleSuspension(user: StaffUserView): Promise<void> {
    const suspended = user.status === 'suspended';
    try {
      await this.service.setStatus(user.id, { status: suspended ? 'active' : 'suspended' });
      this.notify.success(suspended ? 'Accès réactivé.' : 'Accès suspendu.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected isSuspended(user: StaffUserView): boolean {
    return user.status === 'suspended';
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
