import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  StaffNoticeAudienceView,
  StaffNoticeAudiencesView,
  StaffNoticeMemberView,
  StaffNoticeRoleView,
  StaffNoticeTemplate,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldsetComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { NoticeAudiencesService } from '../notice-audiences.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Ce que la carte d'un avis a de coché, avant ou après le geste. */
interface AudienceDraft {
  readonly roleKeys: readonly string[];
  readonly staffUserIds: readonly string[];
}

/** Une case : un rôle ou un membre, déjà traduit en ce que l'écran montre. */
interface ChoiceRow {
  readonly id: string;
  readonly label: string;
  readonly hint: string | undefined;
  readonly checked: boolean;
}

interface NoticeCard {
  readonly template: StaffNoticeTemplate;
  readonly label: string;
  readonly roles: readonly ChoiceRow[];
  readonly members: readonly ChoiceRow[];
  readonly nobody: boolean;
  readonly dirty: boolean;
  readonly refusal: string | null;
}

const ARCHIVED_ROLE_HINT = 'Rôle archivé : il ne vise plus personne';
const UNREACHABLE_MEMBER_HINT = 'Sans adresse joignable : ne reçoit rien';

function savedDraft(notice: StaffNoticeAudienceView): AudienceDraft {
  return {
    roleKeys: notice.roles.map((role) => role.key),
    staffUserIds: notice.members.map((member) => member.staffUserId),
  };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const reference = new Set(left);
  return reference.size === new Set(right).size && right.every((id) => reference.has(id));
}

/** Les candidats, puis ce qui est réglé sans l'être plus (rôle archivé, membre suspendu). */
function mergeById<T>(candidates: readonly T[], set: readonly T[], id: (item: T) => string): T[] {
  const seen = new Set(candidates.map(id));
  return [...candidates, ...set.filter((item) => !seen.has(id(item)))];
}

function roleRow(role: StaffNoticeRoleView, checked: readonly string[]): ChoiceRow {
  return {
    id: role.key,
    label: role.label,
    hint: role.archived ? ARCHIVED_ROLE_HINT : undefined,
    checked: checked.includes(role.key),
  };
}

function memberRow(member: StaffNoticeMemberView, checked: readonly string[]): ChoiceRow {
  return {
    id: member.staffUserId,
    label: `${member.firstName} ${member.lastName}`,
    hint: member.reachable ? undefined : UNREACHABLE_MEMBER_HINT,
    checked: checked.includes(member.staffUserId),
  };
}

function toggled(list: readonly string[], id: string, checked: boolean): readonly string[] {
  const without = list.filter((item) => item !== id);
  return checked ? [...without, id] : without;
}

/**
 * **Destinataires des avis** — pour chaque avis que le système écrit à
 * l'équipe, les rôles et les membres qui le reçoivent. Plan :
 * `documentation/payment/les-liens-de-paiement.md`.
 *
 * Le serveur pose l'ensemble complet : l'écran envoie donc ce qui est coché,
 * jamais un écart, et relit après chaque enregistrement. Rien de coché, c'est
 * la boîte de l'équipe, et la carte le dit en toutes lettres.
 *
 * Sans `write`, aucune case n'existe : la carte liste ce qui est réglé, et
 * une phrase dit pourquoi on ne peut pas le changer.
 */
@Component({
  selector: 'app-notice-audiences-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFieldsetComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './notice-audiences-page.html',
  styleUrl: './notice-audiences-page.scss',
})
export class NoticeAudiencesPage {
  private readonly api = inject(NoticeAudiencesService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  private readonly board = signal<StaffNoticeAudiencesView | null>(null);
  private readonly drafts = signal<Readonly<Record<string, AudienceDraft>>>({});
  private readonly refusals = signal<Readonly<Record<string, string>>>({});
  protected readonly pending = signal<StaffNoticeTemplate | null>(null);

  protected readonly canWrite = computed(() =>
    this.permissions.can('staff_notice_audiences:write'),
  );

  protected readonly cards = computed<readonly NoticeCard[]>(() => {
    const board = this.board();
    if (board === null) {
      return [];
    }
    return board.notices.map((notice) => this.toCard(board, notice));
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.apply(await this.api.board());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected toggleRole(template: StaffNoticeTemplate, key: string, checked: boolean): void {
    this.edit(template, (draft) => ({ ...draft, roleKeys: toggled(draft.roleKeys, key, checked) }));
  }

  protected toggleMember(template: StaffNoticeTemplate, id: string, checked: boolean): void {
    this.edit(template, (draft) => ({
      ...draft,
      staffUserIds: toggled(draft.staffUserIds, id, checked),
    }));
  }

  protected async save(template: StaffNoticeTemplate): Promise<void> {
    const draft = this.drafts()[template];
    if (draft === undefined || this.pending() !== null) {
      return;
    }
    this.pending.set(template);
    this.setRefusal(template, null);
    try {
      await this.api.setAudience(template, {
        roleKeys: [...draft.roleKeys],
        staffUserIds: [...draft.staffUserIds],
      });
      this.notify.success('Destinataires enregistrés.');
      this.apply(await this.api.board());
    } catch (error) {
      this.setRefusal(template, httpErrorMessage(error, "L'enregistrement a échoué."));
    } finally {
      this.pending.set(null);
    }
  }

  private toCard(board: StaffNoticeAudiencesView, notice: StaffNoticeAudienceView): NoticeCard {
    const saved = savedDraft(notice);
    const draft = this.drafts()[notice.template] ?? saved;
    const roles = this.canWrite()
      ? mergeById(board.candidates.roles, notice.roles, (role) => role.key)
      : notice.roles;
    const members = this.canWrite()
      ? mergeById(board.candidates.members, notice.members, (member) => member.staffUserId)
      : notice.members;
    return {
      template: notice.template,
      label: notice.label,
      roles: roles.map((role) => roleRow(role, draft.roleKeys)),
      members: members.map((member) => memberRow(member, draft.staffUserIds)),
      nobody: draft.roleKeys.length === 0 && draft.staffUserIds.length === 0,
      dirty:
        !sameSet(saved.roleKeys, draft.roleKeys) ||
        !sameSet(saved.staffUserIds, draft.staffUserIds),
      refusal: this.refusals()[notice.template] ?? null,
    };
  }

  private apply(board: StaffNoticeAudiencesView): void {
    this.board.set(board);
    this.drafts.set(Object.fromEntries(board.notices.map((n) => [n.template, savedDraft(n)])));
  }

  private edit(
    template: StaffNoticeTemplate,
    change: (draft: AudienceDraft) => AudienceDraft,
  ): void {
    const current = this.drafts()[template];
    if (current === undefined) {
      return;
    }
    this.drafts.update((drafts) => ({ ...drafts, [template]: change(current) }));
    this.setRefusal(template, null);
  }

  private setRefusal(template: StaffNoticeTemplate, message: string | null): void {
    this.refusals.update((refusals) => {
      const rest = Object.fromEntries(Object.entries(refusals).filter(([key]) => key !== template));
      return message === null ? rest : { ...rest, [template]: message };
    });
  }
}
