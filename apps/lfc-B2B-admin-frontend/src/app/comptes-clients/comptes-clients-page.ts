import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldBadgeComponent,
  FoldPaginatorComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldSearchComponent,
  FoldStatusBadgeComponent,
  FoldViewToggleComponent,
  type FoldPaginatorLabels,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PendingAlertsService } from '../shared/alerts/pending-alerts.service';
import { PortfolioBar } from './portfolio-bar/portfolio-bar';
import { PortfolioMetricsService } from './portfolio-metrics.service';
import { AdminCompaniesService } from './admin-companies.service';
import { STATUS_LABELS, type AdminCompany, type CompanyStatus } from './admin-company';
import type { PortfolioMetricsView } from '@lfd/contracts';

import { matchesCompanySearch } from './company-search';
import { companyDisplayName } from '@lfd/contracts';

type LoadState = 'loading' | 'ready' | 'error';

/** Combien de comptes par page par défaut — la première option du sélecteur. */
const PAGE_SIZES: readonly number[] = [25, 50, 100];

/** Le paginator parle anglais par défaut ; cet écran, non. */
const PAGINATOR_LABELS: FoldPaginatorLabels = {
  pageSize: 'Comptes par page',
  perPage: 'par page',
  nav: 'Pagination des comptes',
  previous: 'Page précédente',
  next: 'Page suivante',
  empty: 'Aucun compte',
  page: (page) => `Page ${page}`,
  range: (start, end, total) => `${start}–${end} sur ${total}`,
};

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
    FoldSearchComponent,
    FoldStatusBadgeComponent,
    FoldViewToggleComponent,
    FoldPaginatorComponent,
    PortfolioBar,
    RouterLink,
  ],
  templateUrl: './comptes-clients-page.html',
  styleUrl: './comptes-clients-page.scss',
})
export class ComptesClientsPage {
  private readonly service = inject(AdminCompaniesService);
  private readonly alerts = inject(PendingAlertsService);
  private readonly portfolio = inject(PortfolioMetricsService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly companies = signal<readonly AdminCompany[]>([]);
  protected readonly filter = signal<FilterValue>('all');
  /** Le terme cherché — société, SIRET, ou propriétaire de l'espace. */
  protected readonly search = signal('');
  /**
   * Les alertes qui attendent, par société. Vide tant qu'on ne sait pas — et
   * vide aussi si la lecture échoue : la pastille est un **rappel**, pas la
   * liste. La faire échouer avec elle priverait le commercial de son écran de
   * travail pour une décoration.
   */
  protected readonly pendingAlerts = signal<Readonly<Record<string, number>>>({});
  /** L'état du portefeuille — `null` tant qu'on ne sait pas, et si la lecture échoue. */
  protected readonly metrics = signal<PortfolioMetricsView | null>(null);

  protected readonly paginatorLabels = PAGINATOR_LABELS;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly page = signal(1);
  protected readonly pageSize = signal(PAGE_SIZES[0] ?? 25);

  /** Colonnes de la data-table — chaque `key` a son `<ng-template foldCell>`. */
  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'reference', label: 'Référence', width: '8rem' },
    { key: 'raisonSociale', label: 'Société' },
    { key: 'siret', label: 'SIRET', width: '11rem' },
    { key: 'status', label: 'Statut', width: '8rem' },
    { key: 'contact', label: 'Contact' },
    { key: 'owner', label: 'Espace client' },
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

  /**
   * Sociétés du statut sélectionné **et** répondant à la recherche.
   *
   * La recherche s'applique APRÈS le statut, pas à sa place : les deux répondent
   * à des questions différentes (« où en est ce dossier ? » vs « où est ce
   * client ? »), et les fusionner ferait disparaître des résultats sans qu'on
   * comprenne pourquoi. Le compteur de résultats le dit quand la recherche mord.
   */
  protected readonly filtered = computed<readonly AdminCompany[]>(() => {
    const current = this.filter();
    const term = this.search();
    const all = this.companies();
    const byStatus = current === 'all' ? all : all.filter((company) => company.status === current);
    return term === ''
      ? byStatus
      : byStatus.filter((company) => matchesCompanySearch(company, term));
  });

  /**
   * La tranche affichée. La pagination porte sur le résultat **filtré** : le
   * paginator doit compter ce que l'écran montre, sinon « 1–25 sur 340 » se lit
   * sur une liste qui en contient douze.
   */
  protected readonly paged = computed<readonly AdminCompany[]>(() => {
    const rows = this.filtered();
    const size = this.pageSize();
    const start = (this.clampedPage() - 1) * size;
    return rows.slice(start, start + size);
  });

  /**
   * La page réellement rendue. Filtrer réduit la liste sous la page courante :
   * sans ce recalage, on se retrouverait devant une page vide, sans comprendre
   * que le contenu est plus haut.
   */
  protected readonly clampedPage = computed(() => {
    const pages = Math.max(1, Math.ceil(this.filtered().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });

  /** Y a-t-il une recherche en cours ? Décide de l'état vide et du compteur. */
  protected readonly searching = computed(() => this.search() !== '');

  /** Message d'état vide, contextualisé au segment actif — ou à la recherche. */
  protected readonly emptyState = computed<FoldTableEmpty>(() => {
    if (this.searching()) {
      return {
        title: `Aucun résultat pour « ${this.search()} »`,
        subtitle: 'La recherche porte sur la société, le SIRET et le propriétaire de l’espace.',
      };
    }
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

  /**
   * Le nom sous lequel une société se reconnaît — son enseigne, à défaut sa
   * raison sociale. C'est ce que le commercial cherche des yeux ; la
   * dénomination du greffe ne lui dit rien.
   */
  protected readonly displayName = companyDisplayName;

  /** Identité stable d'une ligne pour la data-table. */
  protected readonly rowKey = (company: AdminCompany): string => company.id;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    // Les deux lectures partent ENSEMBLE : la seconde ne dépend pas de la
    // première, et les enchaîner doublerait l'attente avant le premier pixel.
    const alerts = this.alerts.counts().catch(() => ({}));
    // Comme la pastille : la barre de tête est une lecture de contexte, pas la
    // liste. Son échec ne doit pas emporter l'écran de travail.
    const metrics = this.portfolio.load().catch(() => null);
    try {
      this.companies.set(await this.service.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
    this.pendingAlerts.set(await alerts);
    this.metrics.set(await metrics);
  }

  /** Combien d'alertes attendent sur ce compte — `0` s'il n'y en a aucune. */
  protected pendingAlertsOf(company: AdminCompany): number {
    return this.pendingAlerts()[company.id] ?? 0;
  }

  /** Applique le segment choisi (ignore une valeur inconnue). */
  protected onFilterChange(value: string): void {
    if (isFilterValue(value)) {
      this.filter.set(value);
      this.page.set(1);
    }
  }

  /** Chercher, c'est repartir du début : la page 3 d'un autre résultat n'a pas de sens. */
  protected onSearchChange(term: string): void {
    this.search.set(term);
    this.page.set(1);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  /** Libellé FR du statut d'une société. */
  protected statusLabel(company: AdminCompany): string {
    return STATUS_LABELS[company.status];
  }

  /** Nom lisible du propriétaire de l'espace, ou `null` s'il n'y en a pas. */
  protected ownerName(company: AdminCompany): string | null {
    const owner = company.owner;
    if (owner === null) {
      return null;
    }
    const full = `${owner.firstName} ${owner.lastName}`.trim();
    return full === '' ? owner.email : full;
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
