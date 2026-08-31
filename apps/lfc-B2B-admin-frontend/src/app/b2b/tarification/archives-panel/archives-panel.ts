import { formatEuros } from '@lfd/catalog-ui';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { PRICE_SCOPE_LABELS, PRICE_STAGE_LABELS, type PriceRuleView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { JournalPanel, type JournalPanelData } from '../journal-panel/journal-panel';
import { TarificationService } from '../tarification.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Ce qu'on a rangé** — les règles archivées, de la plus récente à la plus
 * ancienne.
 *
 * Une liste à part, et non des lignes grisées dans le tableau : « qu'est-ce qui
 * s'applique ? » et « qu'a-t-on retiré ? » sont deux questions, et mêler les
 * secondes aux premières rendrait ambigu l'écran qui doit être le plus net de
 * tous. Ranger sert à ne plus voir ; encore faut-il pouvoir retrouver.
 *
 * On ne peut rien y faire, et c'est voulu : une décision archivée est **close**.
 * Reposer la même règle se fait par le geste normal, et ce sera alors une
 * nouvelle décision, avec son auteur et sa date. Le seul bouton de chaque ligne
 * ouvre donc le **journal**, qui répond à la vraie question — pourquoi.
 */
@Component({
  selector: 'app-archives-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldEmptyStateComponent, FoldButtonComponent],
  templateUrl: './archives-panel.html',
  styleUrl: './archives-panel.scss',
})
export class ArchivesPanel {
  private readonly tarification = inject(TarificationService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rules = signal<readonly PriceRuleView[]>([]);

  constructor() {
    effect(() => {
      void this.load();
    });
  }

  /** Ce que la règle faisait, et à qui — la même phrase que sur son nœud. */
  protected summary(rule: PriceRuleView): string {
    const scope =
      rule.scope.id === null
        ? PRICE_SCOPE_LABELS[rule.scope.type]
        : `${PRICE_SCOPE_LABELS[rule.scope.type]} · ${rule.scope.id}`;
    return `${PRICE_STAGE_LABELS[rule.stage]} · ${effectOf(rule)} · ${scope}`;
  }

  /** Qui l'a rangée, et quand. La date d'archivage, pas celle de création. */
  protected archivedLine(rule: PriceRuleView): string {
    const when =
      rule.archivedAt === null ? '' : new Date(rule.archivedAt).toLocaleDateString('fr-FR');
    return `Archivée le ${when} par ${rule.archivedBy ?? 'un membre du staff'}`;
  }

  protected openJournal(rule: PriceRuleView): void {
    this.panels.open<JournalPanelData, boolean>(JournalPanel, {
      data: { subjectType: 'rule', subjectId: rule.id, target: rule.label },
      width: 'md',
    });
  }

  protected close(): void {
    this.ref.close();
  }

  private async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.rules.set(await this.tarification.archivedRules());
      this.state.set('ready');
    } catch (error) {
      this.notify.error(error, "Les archives n'ont pas pu être lues.");
      this.state.set('error');
    }
  }
}

/** Ce que la règle fait au prix, en une expression. */
function effectOf(rule: PriceRuleView): string {
  if (rule.effect.nature === 'replace') {
    return `prix posé à ${formatEuros(rule.effect.amountMillicents)}`;
  }
  const sign = rule.effect.direction === 'decrease' ? '−' : '+';
  return rule.effect.mode === 'percent'
    ? `${sign}${String(rule.effect.value / 100).replace('.', ',')} %`
    : `${sign}${(rule.effect.value / 100).toFixed(2).replace('.', ',')} €`;
}
