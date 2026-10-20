import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  COMPANY_ROLE_LABELS,
  SUB_ACCOUNT_NOTICE_KINDS_WITH_MAIL,
  type CompanyMemberRole,
  type SubAccountNoticeKind,
  type SubAccountNoticeRuleView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowNoteDirective,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';

const ROLES: readonly CompanyMemberRole[] = ['owner', 'admin', 'orders', 'billing'];

/** L'action, dite comme une ligne du tableau. */
const KIND_LABELS: Readonly<Partial<Record<SubAccountNoticeKind, string>>> = {
  order_placed: 'Commande passée',
  order_cancelled: 'Commande annulée ou abandonnée',
  payment_failed: 'Paiement échoué à la charge du principal',
  delivery_address_changed: 'Adresse de livraison ajoutée, modifiée, retirée ou mise par défaut',
  contact_changed: 'Contact ajouté, modifié, retiré, ou contact principal changé',
  order_problem_reported: 'Problème de commande signalé',
};

/** L'action, dite dans la phrase « … à chaque … par ses sous-comptes ». */
const KIND_EVENTS: Readonly<Partial<Record<SubAccountNoticeKind, string>>> = {
  order_placed: 'commande passée',
  order_cancelled: 'commande annulée ou abandonnée',
  payment_failed: 'paiement échoué à sa charge',
  delivery_address_changed: 'adresse de livraison changée',
  contact_changed: 'contact changé',
  order_problem_reported: 'problème de commande signalé',
};

/** Une ligne du tableau : une action, ses quatre cellules. */
export interface NoticeRow {
  readonly kind: SubAccountNoticeKind;
  readonly label: string;
  readonly cells: Readonly<Partial<Record<CompanyMemberRole, SubAccountNoticeRuleView>>>;
}

/** Range les cellules rendues par le serveur en lignes visibles, dans l'ordre du plan. */
export function noticeRows(rules: readonly SubAccountNoticeRuleView[]): readonly NoticeRow[] {
  return SUB_ACCOUNT_NOTICE_KINDS_WITH_MAIL.map((kind) => {
    const cells: Partial<Record<CompanyMemberRole, SubAccountNoticeRuleView>> = {};
    for (const rule of rules) {
      if (rule.kind === kind) {
        cells[rule.role] = rule;
      }
    }
    return { kind, label: KIND_LABELS[kind] ?? kind, cells };
  });
}

/** Le geste en attente de confirmation. */
interface PendingNotice {
  readonly kind: SubAccountNoticeKind;
  readonly role: CompanyMemberRole;
  readonly enabled: boolean;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Ce que le principal reçoit par mail** quand un de ses sous-comptes agit
 * (`plan-notifications-sous-comptes.md`, lot N3) : une ligne par action, une
 * colonne par rôle du principal, un bouton par cellule derrière une
 * confirmation qui dit la conséquence — la même forme que la grille des
 * suivis. Le serveur résout chaque cellule (`atDefault`) ; l'écran ne
 * recompose jamais « dérogation sinon défaut ».
 *
 * En tête, l'interrupteur du principal (décision de Hugo, 2026-10-20) :
 * désactivé par défaut ; tant qu'il l'est, le tableau reste lisible mais
 * inerte — rien ne part, et rien ne sera rattrapé.
 */
@Component({
  selector: 'app-sub-account-notices-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDataTableRowNoteDirective,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './sub-account-notices-card.html',
  styleUrl: './sub-account-notices-card.scss',
})
export class SubAccountNoticesCard {
  private readonly service = inject(AdminCompanyHierarchyService);
  private readonly permissions = inject(PermissionsStore);

  readonly companyId = input.required<string>();
  /** Le nom du principal, tel que les phrases le disent. */
  readonly principalName = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  private readonly rules = signal<readonly SubAccountNoticeRuleView[]>([]);
  /** L'interrupteur du principal — désactivé tant que le staff ne l'a pas activé. */
  protected readonly enabled = signal(false);
  /** La bascule de l'interrupteur en attente de confirmation : la valeur visée. */
  protected readonly switching = signal<boolean | null>(null);
  protected readonly rows = computed(() => noticeRows(this.rules()));
  protected readonly hasOverride = computed(() =>
    this.rows().some((row) => ROLES.some((role) => row.cells[role]?.atDefault === false)),
  );

  protected readonly columns: readonly FoldTableColumn<NoticeRow>[] = [
    { key: 'kind', label: 'Action du sous-compte' },
    ...ROLES.map((role) => ({
      key: role,
      label: COMPANY_ROLE_LABELS[role],
      align: 'center' as const,
      width: '9rem',
    })),
  ];
  protected readonly rowKey = (row: NoticeRow): string => row.kind;
  protected readonly hasNote = (): boolean => true;

  protected readonly pending = signal<PendingNotice | null>(null);
  protected readonly resetting = signal(false);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly canWrite = computed(() => this.permissions.can('b2b_companies:write'));

  constructor() {
    effect(() => {
      const id = this.companyId();
      untracked(() => void this.load(id));
    });
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    await this.load(this.companyId());
  }

  protected cellOf(row: NoticeRow, role: CompanyMemberRole): SubAccountNoticeRuleView | null {
    return row.cells[role] ?? null;
  }

  protected ariaOf(row: NoticeRow, role: CompanyMemberRole): string {
    const enabled = this.cellOf(row, role)?.enabled ?? false;
    return `${enabled ? 'Désactiver' : 'Activer'} le mail « ${row.label} » pour ${COMPANY_ROLE_LABELS[role]}`;
  }

  /** Le résumé sous la ligne : qui reçoit, en clair. */
  protected summary(row: NoticeRow): string {
    const receivers = ROLES.filter((role) => row.cells[role]?.enabled === true).map(
      (role) => COMPANY_ROLE_LABELS[role],
    );
    return receivers.length === 0
      ? 'Personne au principal n’est prévenu.'
      : `Reçoivent le mail : ${receivers.join(', ')}.`;
  }

  /** Ouvre la confirmation de l'interrupteur, vers l'état opposé. */
  protected askSwitch(): void {
    if (!this.canWrite()) {
      return;
    }
    this.pending.set(null);
    this.resetting.set(false);
    this.switching.set(!this.enabled());
  }

  protected switchMessage(target: boolean): string {
    return target
      ? `Les contacts de ${this.principalName()} recevront un mail selon le tableau ci-dessous.`
      : 'Plus aucun avis ne part ; ce qui arrive pendant ce temps ne sera pas envoyé plus tard.';
  }

  protected async confirmSwitch(): Promise<void> {
    const target = this.switching();
    if (target === null || this.saving()) {
      return;
    }
    await this.write(
      () => this.service.setSubAccountNoticesEnabled(this.companyId(), target),
      target ? 'Activer les avis' : 'Désactiver les avis',
    );
    this.switching.set(null);
  }

  /** Ouvre la confirmation : on ne coupe ni n'ouvre un courrier par réflexe. */
  protected ask(row: NoticeRow, role: CompanyMemberRole): void {
    if (!this.canWrite() || !this.enabled()) {
      return;
    }
    this.switching.set(null);
    this.resetting.set(false);
    this.pending.set({ kind: row.kind, role, enabled: !(row.cells[role]?.enabled ?? false) });
  }

  protected pendingMessage(pending: PendingNotice): string {
    const members = `Les membres ${COMPANY_ROLE_LABELS[pending.role]} de ${this.principalName()}`;
    const event = KIND_EVENTS[pending.kind] ?? pending.kind;
    return pending.enabled
      ? `${members} recevront un mail à chaque ${event} par ses sous-comptes.`
      : `${members} ne recevront plus de mail à chaque ${event} par ses sous-comptes.`;
  }

  protected resetMessage(): string {
    return `Revenir au défaut ? Les réglages propres à ${this.principalName()} sont effacés : chaque cellule reprend la valeur par défaut.`;
  }

  protected async confirmPending(): Promise<void> {
    const pending = this.pending();
    if (pending === null || this.saving()) {
      return;
    }
    await this.write(
      () => this.service.setSubAccountNotice(this.companyId(), pending),
      `« ${KIND_LABELS[pending.kind] ?? pending.kind} » pour ${COMPANY_ROLE_LABELS[pending.role]}`,
    );
    this.pending.set(null);
  }

  protected async confirmReset(): Promise<void> {
    if (this.saving()) {
      return;
    }
    await this.write(
      () => this.service.resetSubAccountNotices(this.companyId()),
      'Revenir au défaut',
    );
    this.resetting.set(false);
  }

  /** Écrit, puis RELIT dans tous les cas : après un refus, la cellule redit l'enregistré. */
  private async write(action: () => Promise<void>, what: string): Promise<void> {
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await action();
    } catch (error) {
      this.refusal.set(`${what} : ${httpErrorMessage(error, 'le réglage n’a pas changé.')}`);
    } finally {
      await this.load(this.companyId());
      this.saving.set(false);
    }
  }

  private async load(companyId: string): Promise<void> {
    try {
      const board = await this.service.subAccountNotices(companyId);
      this.enabled.set(board.enabled);
      this.rules.set(board.cells);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
