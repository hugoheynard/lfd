import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  AdminFeatureAccessView,
  AdminFeatureView,
  FeatureKey,
  IgnoredFeatureRowView,
} from '@lfd/contracts';
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
  type FoldSelectOption,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import {
  ACCOUNT_STATE_BADGES,
  type AccountStateBadge,
  authoredLine,
  ignoredRowLine,
  isKnownFeatureKey,
  levelLabel,
} from '../feature-access-labels';
import { FeatureAccessService } from '../feature-access.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Une adresse exemptée, telle que la ligne la peint. */
interface ExemptionRow {
  readonly id: string;
  readonly email: string;
  readonly added: string;
  readonly badge: AccountStateBadge;
}

/** Une carte : un flag du catalogue, déjà traduit en ce que l'écran montre. */
interface FeatureCard {
  readonly key: FeatureKey;
  readonly label: string;
  readonly description: string;
  readonly options: readonly FoldSelectOption<string>[];
  readonly effectiveLevel: string;
  readonly effectiveLabel: string;
  /** `null` = défaut du code. */
  readonly provenance: string | null;
  readonly defaultLabel: string;
  /** `false` : la clé ne s'ouvre pas adresse par adresse — pas de formulaire d'ajout. */
  readonly exemptible: boolean;
  readonly exemptions: readonly ExemptionRow[];
}

function toCard(key: FeatureKey, feature: AdminFeatureView): FeatureCard {
  return {
    key,
    label: feature.label,
    description: feature.description,
    options: feature.levels.map((level) => ({ value: level, label: levelLabel(key, level) })),
    effectiveLevel: feature.effectiveLevel,
    effectiveLabel: levelLabel(key, feature.effectiveLevel),
    provenance:
      feature.override === null
        ? null
        : authoredLine('Posé', feature.override.updatedBy, feature.override.updatedAt),
    defaultLabel: levelLabel(key, feature.defaultLevel),
    exemptible: feature.exemptible,
    exemptions: feature.exemptions.map((exemption) => ({
      id: exemption.id,
      email: exemption.email,
      added: authoredLine('Ajoutée', exemption.createdBy, exemption.createdAt),
      badge: ACCOUNT_STATE_BADGES[exemption.accountState],
    })),
  };
}

/**
 * **Accès aux fonctionnalités** — ce qu'on peut faire de la boutique, réglé
 * sans redéployer. Plan : `documentation/b2b/plan-inscription-pro-seule.md` §5.
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
  protected readonly pendingKey = signal<FeatureKey | null>(null);
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
  protected readonly unreadable = computed<readonly string[]>(() => {
    const board = this.board();
    if (board === null) {
      return [];
    }
    const unknownToScreen = board.features
      .filter((feature) => !isKnownFeatureKey(feature.key))
      .map((feature) => `la fonctionnalité « ${feature.key} » : cet écran ne la connaît pas`);
    return [
      ...board.ignored.map((row: IgnoredFeatureRowView) => ignoredRowLine(row)),
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

  protected removeMessage(row: ExemptionRow): string {
    return `Retirer ${row.email} de la liste ? Cette adresse suivra de nouveau le niveau.`;
  }

  /**
   * Une écriture, et le tableau qu'elle rend. En cas d'échec le serveur a le
   * dernier mot : on relit pour ne pas laisser à l'écran un geste qui n'a pas eu
   * lieu. Rend vrai si l'écriture est passée.
   */
  private async write(
    key: FeatureKey,
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
