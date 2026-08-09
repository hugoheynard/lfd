import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldBadgeComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';
import type { CustomerSheetView } from '@lfd/contracts';

import {
  STATUS_LABELS,
  type AdminCompany,
  type CompanyStatus,
} from '../../../comptes-clients/admin-company';
import type { PinnedAccount } from '../pinned-store';
import { availableMetrics, metricByKey, type MetricDefinition } from './metric-catalog';

/** Ton du statut — la carte se lit à la couleur avant de se lire au texte. */
type BadgeVariant = 'neutral' | 'accent' | 'info' | 'warning' | 'alert' | 'success';

const STATUS_VARIANT: Record<CompanyStatus, BadgeVariant> = {
  pending: 'warning',
  active: 'success',
  suspended: 'alert',
  terminated: 'neutral',
};

/** Un indicateur prêt à l'affichage. */
interface MetricCell {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tone: 'up' | 'down' | null;
}

/** Une carte, entièrement calculée — le gabarit ne fait plus que lire. */
interface AccountCard {
  readonly company: AdminCompany;
  readonly status: string;
  readonly variant: BadgeVariant;
  readonly metrics: readonly MetricCell[];
  readonly addable: readonly MetricDefinition[];
  /** Vrai quand un indicateur est demandé mais que sa fiche n'est pas encore là. */
  readonly loading: boolean;
}

/** Ce que la page a chargé : la fiche d'un compte, par identifiant. */
export type SheetsById = ReadonlyMap<string, CustomerSheetView>;

/**
 * Les **comptes suivis** — les clients qu'on garde sous les yeux, chacun avec les
 * indicateurs qu'on a choisi d'y voir.
 *
 * Présentationnel : la page possède les comptes, les fiches et le magasin.
 *
 * Le choix des indicateurs est **par compte**, et c'est délibéré : on ne suit pas
 * deux clients pour la même raison — l'un pour ses paniers récurrents, l'autre
 * parce qu'il n'a plus commandé depuis six semaines. Un jeu d'indicateurs commun
 * rendrait les cartes comparables, mais forcerait la moitié à afficher un chiffre
 * dont personne n'a besoin.
 */
@Component({
  selector: 'app-pinned-accounts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldPopoverTriggerDirective,
    RouterLink,
  ],
  templateUrl: './pinned-accounts.html',
  styleUrl: './pinned-accounts.scss',
})
export class PinnedAccounts {
  readonly companies = input.required<readonly AdminCompany[]>();
  /** Les épingles, avec les indicateurs choisis. */
  readonly accounts = input.required<readonly PinnedAccount[]>();
  /** Les fiches chargées — absentes tant qu'aucun indicateur n'en réclame. */
  readonly sheets = input.required<SheetsById>();

  readonly unpinned = output<string>();
  readonly metricAdded = output<{ companyId: string; metric: string }>();
  readonly metricRemoved = output<{ companyId: string; metric: string }>();

  protected readonly cards = computed<readonly AccountCard[]>(() => {
    const byId = new Map(this.accounts().map((account) => [account.companyId, account]));
    return this.companies().map((company) => {
      const chosen = byId.get(company.id)?.metrics ?? [];
      const sheet = this.sheets().get(company.id);
      return {
        company,
        status: STATUS_LABELS[company.status],
        variant: STATUS_VARIANT[company.status],
        metrics: sheet === undefined ? [] : chosen.map((key) => cellOf(key, sheet)).filter(isCell),
        addable: availableMetrics(chosen),
        loading: chosen.length > 0 && sheet === undefined,
      };
    });
  });

  protected unpin(event: Event, companyId: string): void {
    // La carte est un lien : retirer l'épingle ne doit pas ouvrir la fiche.
    event.preventDefault();
    event.stopPropagation();
    this.unpinned.emit(companyId);
  }

  protected addMetric(companyId: string, metric: string): void {
    this.metricAdded.emit({ companyId, metric });
  }

  protected removeMetric(event: Event, companyId: string, metric: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.metricRemoved.emit({ companyId, metric });
  }
}

/** Un indicateur lu depuis la fiche, ou `null` si sa clé n'existe plus. */
function cellOf(key: string, sheet: CustomerSheetView): MetricCell | null {
  const metric = metricByKey(key);
  if (metric === undefined) {
    return null;
  }
  return {
    key,
    label: metric.label,
    value: metric.read(sheet),
    tone: metric.tone?.(sheet) ?? null,
  };
}

function isCell(cell: MetricCell | null): cell is MetricCell {
  return cell !== null;
}
