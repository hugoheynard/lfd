import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldStatusBadgeComponent,
  FoldViewToggleComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldViewToggleOption,
} from 'fold-ng';

import { AdminCompaniesService } from './admin-companies.service';
import { STATUS_LABELS, type AdminCompany, type CompanyStatus } from './admin-company';

type LoadState = 'loading' | 'ready' | 'error';

/** Valeur du filtre : un statut, ou `all` pour la vue d'ensemble. */
type FilterValue = 'all' | CompanyStatus;

/** Ordre des statuts dans le filtre — `all` en tête, l'actionnable (`pending`) en 2ᵉ. */
const FILTER_ORDER: readonly FilterValue[] = [
  'all',
  'pending',
  'active',
  'suspended',
  'terminated',
];

/** Vrai si la chaîne est une valeur de filtre connue (garde l'événement du toggle). */
function isFilterValue(value: string): value is FilterValue {
  return (FILTER_ORDER as readonly string[]).includes(value);
}

/**
 * Onglet **Comptes clients** (commercial) : la liste cross-tenant des sociétés,
 * lue depuis `GET /admin/companies`, présentée dans une **fold data-table**.
 *
 * Un seul jeu de données, filtré par un **segment** (`fold-view-toggle`) plutôt
 * que par des pages séparées : les colonnes sont identiques d'un statut à
 * l'autre, la recherche/tri restent partagés. Les `pending` se lisent en **deux
 * files distinctes au premier coup d'œil** — *à vérifier* (dossier auto-rempli)
 * vs *assistance* (le client a demandé un rappel, support ouvert) — via un badge
 * dédié en tête et dans la colonne Statut. Tri et fiche détail viennent ensuite
 * (cf. admin-commercial-comptes-clients.md).
 */
@Component({
  selector: 'app-comptes-clients-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldStatusBadgeComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './comptes-clients-page.html',
  styleUrl: './comptes-clients-page.scss',
})
export class ComptesClientsPage {
  private readonly service = inject(AdminCompaniesService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly companies = signal<readonly AdminCompany[]>([]);
  protected readonly filter = signal<FilterValue>('all');

  /** Colonnes de la data-table — chaque `key` a son `<ng-template foldCell>`. */
  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'reference', label: 'Référence', width: '8rem' },
    { key: 'raisonSociale', label: 'Société' },
    { key: 'siret', label: 'SIRET', width: '11rem' },
    { key: 'status', label: 'Statut', width: '8rem' },
    { key: 'contact', label: 'Contact' },
    { key: 'createdAt', label: 'Créé le', width: '7rem', align: 'right' },
  ];

  /** Segments du filtre — libellés fixes, dans l'ordre de `FILTER_ORDER`. */
  protected readonly segments: readonly FoldViewToggleOption[] = [
    { value: 'all', label: 'Tous' },
    { value: 'pending', label: 'En attente' },
    { value: 'active', label: 'Actif' },
    { value: 'suspended', label: 'Suspendu' },
    { value: 'terminated', label: 'Résilié' },
  ];

  /**
   * Une société `pending` qui a **demandé de l'assistance** (support ouvert) —
   * à rappeler, distinct de la simple attente de vérification des pièces.
   */
  protected isAssistance(company: AdminCompany): boolean {
    return company.status === 'pending' && company.hasOpenSupportRequest;
  }

  /** `pending` **sans** demande d'assistance : dossier auto-rempli à vérifier. */
  protected readonly awaitingActivationCount = computed(
    () => this.companies().filter((c) => c.status === 'pending' && !c.hasOpenSupportRequest).length,
  );

  /** `pending` **avec** demande d'assistance ouverte : le client veut un rappel. */
  protected readonly assistanceCount = computed(
    () => this.companies().filter((c) => this.isAssistance(c)).length,
  );

  /** Sociétés du statut sélectionné (ou toutes). */
  protected readonly filtered = computed<readonly AdminCompany[]>(() => {
    const current = this.filter();
    const all = this.companies();
    return current === 'all' ? all : all.filter((company) => company.status === current);
  });

  /** Message d'état vide, contextualisé au segment actif. */
  protected readonly emptyState = computed<FoldTableEmpty>(() => {
    const current = this.filter();
    if (current === 'all') {
      return { title: 'Aucune société', subtitle: 'Aucun compte client pour le moment.' };
    }
    const label = this.segments.find((segment) => segment.value === current)?.label ?? '';
    return {
      title: `Aucun compte « ${label} »`,
      subtitle: 'Change de filtre pour voir les autres.',
    };
  });

  /** Identité stable d'une ligne pour la data-table. */
  protected readonly rowKey = (company: AdminCompany): string => company.id;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.companies.set(await this.service.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Applique le segment choisi (ignore une valeur inconnue). */
  protected onFilterChange(value: string): void {
    if (isFilterValue(value)) {
      this.filter.set(value);
    }
  }

  /** Libellé FR du statut d'une société. */
  protected statusLabel(company: AdminCompany): string {
    return STATUS_LABELS[company.status];
  }

  /** Nom lisible du contact principal, ou `—` si vide. */
  protected contactName(company: AdminCompany): string {
    const full = `${company.primaryContact.firstName} ${company.primaryContact.lastName}`.trim();
    return full === '' ? '—' : full;
  }

  /** Date de création formatée (jj/mm/aaaa). */
  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR');
  }
}
