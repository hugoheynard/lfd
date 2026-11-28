import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { AdminFeatureAccessView, FeatureKey, IgnoredFeatureRowView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { isKnownFeatureKey } from '../../../shared/feature-levels';
import { ignoredRowLine } from '../feature-access-labels';
import {
  type ExemptionRow,
  type FeatureCard,
  removable,
  toCard,
  type UnreadableRow,
} from '../feature-access-cards';
import { FeatureAccessService } from '../feature-access.service';
import {
  type CompanyExemptionRow,
  type ExemptibleCompanyOption,
  FeatureCompanyExemptions,
} from '../feature-company-exemptions/feature-company-exemptions';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Accès aux fonctionnalités** — ce qu'on peut faire de la boutique, réglé
 * sans redéployer. Plan : `documentation/auth-inscription/plan-inscription-pro-seule.md` §5.
 *
 * ## Le serveur décide, l'écran relit
 *
 * Aucune valeur effective n'est calculée ici : chaque geste relit le tableau.
 * L'état d'un compte exempté en dépend — le runbook (§6) demande de voir
 * « vérifiée » AVANT de fermer, et un état deviné côté écran serait précisément
 * la phrase qui rassure à tort.
 *
 * ## Lecture seule sans champ grisé
 *
 * `commercial` lit cette ressource pour répondre à un client, il ne la règle
 * pas. Il ne voit donc aucun contrôle d'écriture, et une phrase dit pourquoi :
 * un champ grisé laisse chercher le moyen de l'activer.
 *
 * ## Ce que le catalogue ne sait pas lire
 *
 * Une ligne de base hors catalogue est montrée, jamais interprétée : elle ne
 * s'applique pas, et la présenter comme un réglage ferait croire qu'elle joue.
 */
@Component({
  selector: 'app-feature-access-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FeatureCompanyExemptions,
  ],
  templateUrl: './feature-access-page.html',
  styleUrl: './feature-access-page.scss',
})
export class FeatureAccessPage {
  private readonly api = inject(FeatureAccessService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly state = signal<LoadState>('loading');
  private readonly board = signal<AdminFeatureAccessView | null>(null);
  /** Une relecture a échoué après un premier chargement : l'écran garde la dernière. */
  protected readonly staleBoard = signal(false);
  /** La clé dont une écriture est en vol — ses contrôles attendent. */
  protected readonly pendingKey = signal<string | null>(null);
  /** Les sociétés que le sélecteur propose ; vide tant qu'elles ne sont pas lues. */
  protected readonly companies = signal<readonly ExemptibleCompanyOption[]>([]);
  /** L'adresse en cours de saisie, par clé. */
  private readonly drafts = signal<Readonly<Record<string, string>>>({});
  /**
   * Incrémenté quand une pose de niveau échoue. Le sélecteur a déjà affiché le
   * choix refusé, et relire la même valeur ne le repeint pas (une entrée ne se
   * rafraîchit que si elle change) : on reconstruit la carte.
   */
  protected readonly revision = signal(0);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_feature_access:write'));

  protected readonly cards = computed<readonly FeatureCard[]>(() =>
    (this.board()?.features ?? []).flatMap((feature) =>
      isKnownFeatureKey(feature.key) ? [toCard(feature.key, feature)] : [],
    ),
  );

  /**
   * Tout ce qui est en base et ne se lit pas : les lignes que le serveur a
   * écartées, et les clés qu'il connaît mais que CE front ne connaît pas encore.
   */
  protected readonly unreadable = computed<readonly UnreadableRow[]>(() => {
    const board = this.board();
    if (board === null) {
      return [];
    }
    const unknownToScreen = board.features
      .filter((feature) => !isKnownFeatureKey(feature.key))
      .map((feature) => ({
        line: `la fonctionnalité « ${feature.key} » : cet écran ne la connaît pas`,
        removal: null,
      }));
    return [
      ...board.ignored.map((row) => ({ line: ignoredRowLine(row), removal: removable(row) })),
      ...unknownToScreen,
    ];
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.board.set(await this.api.board());
      this.staleBoard.set(false);
      this.state.set('ready');
    } catch {
      this.state.set('error');
      return;
    }
    await this.loadCompanies();
  }

  /**
   * Le sélecteur ne sert qu'à qui écrit, et qu'à une clé qui s'exempte par
   * société. Un échec le laisse vide et le dit : la liste, elle, reste lue.
   */
  private async loadCompanies(): Promise<void> {
    const wanted = this.cards().some((card) => card.exemptBy === 'company');
    if (!this.canWrite() || !wanted) {
      return;
    }
    try {
      this.companies.set(await this.api.exemptibleCompanies());
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected draft(key: FeatureKey): string {
    return this.drafts()[key] ?? '';
  }

  protected setDraft(key: FeatureKey, email: string): void {
    this.drafts.update((drafts) => ({ ...drafts, [key]: email }));
  }

  protected async chooseLevel(card: FeatureCard, level: string): Promise<void> {
    if (level === card.effectiveLevel) {
      return;
    }
    const applied = await this.write(card.key, () => this.api.setOverride(card.key, level));
    if (!applied) {
      this.revision.update((value) => value + 1);
    }
  }

  protected async revertToDefault(card: FeatureCard): Promise<void> {
    await this.write(card.key, () => this.api.clearOverride(card.key));
  }

  protected async addExemption(card: FeatureCard): Promise<void> {
    const email = this.draft(card.key).trim();
    if (email === '') {
      return;
    }
    if (await this.write(card.key, () => this.api.addExemption(card.key, email))) {
      this.setDraft(card.key, '');
    }
  }

  protected async removeExemption(card: FeatureCard, row: ExemptionRow): Promise<void> {
    await this.write(card.key, () => this.api.removeExemption(card.key, row.id));
  }

  protected async addCompanyExemption(card: FeatureCard, companyId: string): Promise<void> {
    await this.write(card.key, () => this.api.addCompanyExemption(card.key, companyId));
  }

  protected async removeCompanyExemption(
    card: FeatureCard,
    row: CompanyExemptionRow,
  ): Promise<void> {
    await this.write(card.key, () => this.api.removeCompanyExemption(card.key, row.companyId));
  }

  /** Retire une exemption que le catalogue ignore, par le geste de sa table. */
  protected async removeIgnored(row: IgnoredFeatureRowView): Promise<void> {
    const id = row.id;
    if (id === null) {
      return;
    }
    await this.write(row.key, () =>
      row.table === 'company_exemption'
        ? this.api.removeCompanyExemption(row.key, id)
        : this.api.removeExemption(row.key, id),
    );
  }

  protected removeMessage(row: ExemptionRow): string {
    return `Retirer ${row.email} de la liste ? Cette adresse suivra de nouveau le niveau.`;
  }

  /**
   * Une écriture, et le tableau qu'elle rend. En cas d'échec le serveur a le
   * dernier mot : on relit pour ne pas laisser à l'écran un geste qui n'a pas eu
   * lieu. Rend vrai si l'écriture est passée.
   */
  private async write(
    key: string,
    request: () => Promise<AdminFeatureAccessView>,
  ): Promise<boolean> {
    if (this.pendingKey() !== null) {
      return false;
    }
    this.pendingKey.set(key);
    try {
      this.board.set(await request());
      this.staleBoard.set(false);
      return true;
    } catch (error) {
      this.notify.error(error);
      await this.refresh();
      return false;
    } finally {
      this.pendingKey.set(null);
    }
  }

  /** Relecture sans tomber l'écran : un échec laisse la dernière lecture, et le dit. */
  protected async refresh(): Promise<void> {
    try {
      this.board.set(await this.api.board());
      this.staleBoard.set(false);
    } catch {
      this.staleBoard.set(true);
    }
  }
}
