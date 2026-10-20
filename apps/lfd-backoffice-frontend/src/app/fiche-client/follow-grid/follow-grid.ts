import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { CompanyFollowAspect, SubAccountView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowNoteDirective,
  FoldInlineConfirmComponent,
  FoldStatusBadgeComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import { FOLLOW_ASPECT_LABELS, STATUS_LABELS } from '../../comptes-clients/admin-company';

/** Les colonnes de suivi, dans l'ordre où on règle un site : qui paie, à quel prix, qui joindre. */
const ASPECTS: readonly CompanyFollowAspect[] = ['billing', 'pricing', 'contacts'];

/**
 * Ce qu'activer ou désactiver un suivi CHANGE, dit avant de le faire. Les
 * commandes déjà passées ne bougent jamais : le payeur et le prix y sont
 * copiés à la passation (`sous-comptes.md` §2.2, §2.3).
 */
const CONSEQUENCES: Readonly<
  Record<CompanyFollowAspect, { readonly on: Consequence; readonly off: Consequence }>
> = {
  billing: {
    on: (site) =>
      `${site} sera facturé et prélevé au nom du compte principal : son RIB, son mandat et ses conditions de règlement. Les commandes déjà passées gardent leur payeur.`,
    off: (site) =>
      `${site} redevient son propre payeur : il lui faut sa propre identité légale, son RIB et un mandat pour être prélevé. Les commandes déjà passées gardent leur payeur.`,
  },
  pricing: {
    on: (site) =>
      `La mercuriale et les engagements du compte principal s’appliquent aux prochaines commandes de ${site}. Ses propres prix ne sont pas effacés : ils attendent.`,
    off: (site) =>
      `${site} reprend ses propres prix pour ses prochaines commandes. Les commandes déjà passées gardent leur prix.`,
  },
  contacts: {
    on: (site) =>
      `Les contacts du compte principal seront partagés avec ${site}. Le suivi est enregistré, mais aucun écran ne combine encore les contacts (sous-comptes S5).`,
    off: (site) => `${site} ne partage plus les contacts du compte principal.`,
  },
};

type Consequence = (site: string) => string;

/**
 * Le résumé écrit, sous chaque ligne : ce que le sous-compte FAIT en ce
 * moment, aspect par aspect — la grille dit l'état, la phrase dit ce qu'il
 * veut dire.
 */
const CAPABILITIES: Readonly<
  Record<CompanyFollowAspect, { readonly on: Consequence; readonly off: string }>
> = {
  billing: {
    on: (parent) =>
      `les commandes de ce sous-compte sont facturées et prélevées au compte principal ${parent}.`,
    off: 'les commandes de ce sous-compte sont facturées et prélevées à son propre nom.',
  },
  pricing: {
    on: (parent) => `ses commandes suivent la mercuriale et les engagements de ${parent}.`,
    off: 'ses commandes suivent ses propres prix.',
  },
  contacts: {
    on: (parent) =>
      `il partage les contacts de ${parent} (enregistré, pas encore combiné à l’écran).`,
    off: 'il a ses propres contacts.',
  },
};

/** Le geste en attente de confirmation. */
interface PendingFollow {
  readonly row: SubAccountView;
  readonly aspect: CompanyFollowAspect;
  readonly following: boolean;
}

/**
 * **La grille des suivis**, sur la page Sous-comptes du principal (Hugo,
 * 2026-10-20) : une ligne par sous-compte, une case par aspect.
 *
 * Le réglage vit chez le principal parce que c'est lui qui négocie le tarif
 * et paie pour ses sites, et qu'on ouvre souvent plusieurs sites le même
 * jour avec les mêmes réglages. Chaque case appelle la route du sous-compte
 * concerné : mêmes gardes serveur que depuis sa fiche (facturation refusée
 * sous un principal en attente, tarif réservé au droit de tarification).
 */
@Component({
  selector: 'app-follow-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDataTableRowNoteDirective,
    FoldInlineConfirmComponent,
    FoldStatusBadgeComponent,
  ],
  templateUrl: './follow-grid.html',
  styleUrl: './follow-grid.scss',
})
export class FollowGrid {
  private readonly service = inject(AdminCompanyHierarchyService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);

  readonly subAccounts = input.required<readonly SubAccountView[]>();
  /** Le nom du principal, tel que les phrases le disent. */
  readonly parentName = input.required<string>();

  /** Un suivi a changé : la fiche relit. */
  readonly changed = output<void>();

  protected readonly aspectLabels = FOLLOW_ASPECT_LABELS;
  protected readonly columns: readonly FoldTableColumn<SubAccountView>[] = [
    { key: 'site', label: 'Sous-compte' },
    { key: 'status', label: 'Statut', width: '8rem' },
    ...ASPECTS.map((aspect) => ({
      key: aspect,
      label: FOLLOW_ASPECT_LABELS[aspect],
      align: 'center' as const,
      width: '9rem',
    })),
    { key: 'detach', label: '', width: '7rem', align: 'right' },
  ];
  protected readonly rowKey = (row: SubAccountView): string => row.id;
  /** Chaque ligne porte son résumé : un sous-compte a toujours un état à dire. */
  protected readonly hasNote = (): boolean => true;
  protected readonly summaryAspects = ASPECTS;

  /** La case en cours d'enregistrement, `id:aspect` — une à la fois. */
  protected readonly saving = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);
  /** Le suivi dont on confirme le changement, ou `null`. */
  protected readonly pending = signal<PendingFollow | null>(null);
  /** Le sous-compte dont on confirme le détachement, ou `null`. */
  protected readonly detaching = signal<SubAccountView | null>(null);
  protected readonly busy = signal(false);
  private readonly canPrice = computed(() => this.permissions.can('b2b_pricing:write'));

  protected capability(row: SubAccountView, aspect: CompanyFollowAspect): string {
    const phrases = CAPABILITIES[aspect];
    return this.sinceOf(row, aspect) === null ? phrases.off : phrases.on(this.parentName());
  }

  protected aspectLabel(aspect: CompanyFollowAspect): string {
    return FOLLOW_ASPECT_LABELS[aspect];
  }

  protected statusLabel(row: SubAccountView): string {
    return STATUS_LABELS[row.status];
  }

  /**
   * Ce que détacher ferme — dit AVANT, parce qu'un site détaché perd d'un
   * coup son payeur et son tarif.
   */
  protected confirmMessage(row: SubAccountView): string {
    const open = row.follows.map((follow) => FOLLOW_ASPECT_LABELS[follow.aspect].toLowerCase());
    const closing =
      open.length === 0
        ? 'Aucun aspect n’est suivi en ce moment.'
        : `Toutes ses périodes de suivi se ferment (${open.join(', ')}) : il reprend ses propres valeurs.`;
    return `Détacher ${row.enseigne} de ce compte ? ${closing}`;
  }

  protected async detach(row: SubAccountView): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.pending.set(null);
    this.refusal.set(null);
    try {
      await this.service.detach(row.id);
      this.notify.success(`${row.enseigne} détaché.`);
      this.detaching.set(null);
      this.changed.emit();
    } catch (error) {
      this.refusal.set(
        `${row.enseigne} : ${httpErrorMessage(error, 'le compte n’a pas été détaché.')}`,
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected sinceOf(row: SubAccountView, aspect: CompanyFollowAspect): string | null {
    const follow = row.follows.find((candidate) => candidate.aspect === aspect);
    return follow === undefined ? null : new Date(follow.since).toLocaleDateString('fr-FR');
  }

  protected canEdit(aspect: CompanyFollowAspect): boolean {
    return aspect !== 'pricing' || this.canPrice();
  }

  protected ariaOf(row: SubAccountView, aspect: CompanyFollowAspect): string {
    const verb = this.sinceOf(row, aspect) === null ? 'Activer' : 'Désactiver';
    const base = `${verb} le suivi ${FOLLOW_ASPECT_LABELS[aspect].toLowerCase()} de ${row.enseigne}`;
    return this.canEdit(aspect) ? base : `${base} — réservé au droit de tarification`;
  }

  /** Ouvre la confirmation : un changement de suivi ne se donne pas par réflexe. */
  protected ask(row: SubAccountView, aspect: CompanyFollowAspect): void {
    if (!this.canEdit(aspect)) {
      return;
    }
    this.detaching.set(null);
    this.pending.set({ row, aspect, following: this.sinceOf(row, aspect) === null });
  }

  protected pendingMessage(pending: PendingFollow): string {
    const verb = pending.following ? 'Activer' : 'Désactiver';
    const label = FOLLOW_ASPECT_LABELS[pending.aspect].toLowerCase();
    const consequence = CONSEQUENCES[pending.aspect][pending.following ? 'on' : 'off'];
    return `${verb} le suivi « ${label} » de ${pending.row.enseigne} ? ${consequence(pending.row.enseigne)}`;
  }

  protected async confirmPending(): Promise<void> {
    const pending = this.pending();
    if (pending === null) {
      return;
    }
    await this.toggle(pending.row, pending.aspect, pending.following);
    this.pending.set(null);
  }

  private async toggle(
    row: SubAccountView,
    aspect: CompanyFollowAspect,
    following: boolean,
  ): Promise<void> {
    if (this.saving() !== null) {
      return;
    }
    this.saving.set(`${row.id}:${aspect}`);
    this.refusal.set(null);
    try {
      await this.service.setFollowing(row.id, aspect, following);
      this.changed.emit();
    } catch (error) {
      this.refusal.set(
        `${row.enseigne} : ${httpErrorMessage(error, 'le suivi du compte principal n’a pas changé.')}`,
      );
    } finally {
      this.saving.set(null);
    }
  }
}
