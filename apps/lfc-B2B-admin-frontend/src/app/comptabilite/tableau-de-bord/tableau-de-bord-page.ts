import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  BillingCycleView,
  CatalogSummaryView,
  CustomerPortfolioView,
  LegalEntityView,
} from '@lfd/contracts';
import { NEW_CUSTOMER_WINDOW_DAYS } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSurfaceDirective,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { saveBlob } from '../../shared/download/save-blob';
import { ComptabiliteDashboardService } from '../comptabilite-dashboard.service';
import { CycleBar } from '../cycle-bar/cycle-bar';
import { LegalEntitiesService } from '../legal-entities.service';

/**
 * **Le tableau de bord de la comptabilité** — la porte de l'espace.
 *
 * ## Ce qu'il montre, et ce qu'il refuse de montrer
 *
 * Quatre cartes, une par fonction de l'espace. Deux sont **vivantes** : le
 * portefeuille client et le catalogue vendu, chacune avec ses nombres et son
 * export CSV. Deux ne le sont pas encore, et elles le **disent** au lieu
 * d'afficher un zéro.
 *
 * 🔴 La distinction n'est pas cosmétique. « 0 facture à collecter » dirait
 * « rien à encaisser » ; la phrase vraie est « on ne sait pas encore compter ».
 * Le dépôt tient déjà l'inverse ailleurs — un `0` s'affiche comme les autres
 * parce qu'il veut dire quelque chose — et c'est précisément pour ça qu'une
 * brique absente ne peut pas emprunter la même forme.
 *
 * ## Une carte à moitié vivante, et c'est la plus utile
 *
 * Le prélèvement SEPA ne peut rien exporter tant que la facturation n'existe
 * pas. Mais sa **première condition bloquante** est déjà vérifiable : sans ICS
 * ni compte créancier, aucun lot ne partirait de toute façon. La carte répond
 * donc à ce qu'elle sait — « l'émetteur est prêt » ou « il lui manque ceci » —
 * plutôt que d'attendre passivement sa tranche.
 *
 * ## La bande de tête, sur le chrome
 *
 * Titre, chiffres et cycle de prélèvement vivent dans une `fold-page-section`
 * `bleed` posée sur `foldSurface="chrome"` — la même partition que la
 * tarification et le catalogue : le **verdict** sur le fond sombre, l'**établi**
 * sur le papier. Aucun fond n'est peint à la main : c'est le thème `navi` qui
 * donne au chrome sa polarité, et la section qui annule la gouttière.
 *
 * ## Quatre lectures, jamais une par ligne
 *
 * Portefeuille, catalogue, entités, cycle : quatre requêtes au chargement,
 * lancées ensemble. Aucune ne dépend d'une autre, et aucune ne se répète par
 * élément affiché — c'est le facteur qu'un tableau de bord attrape le plus
 * facilement. Le cycle est le seul dont l'échec est **partiel** : il coûte sa
 * bande, pas la page.
 */
@Component({
  selector: 'app-tableau-de-bord-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CycleBar,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSurfaceDirective,
  ],
  templateUrl: './tableau-de-bord-page.html',
  styleUrl: './tableau-de-bord-page.scss',
})
export class TableauDeBordPage {
  private readonly api = inject(ComptabiliteDashboardService);
  private readonly entitiesApi = inject(LegalEntitiesService);

  protected readonly customers = signal<CustomerPortfolioView | null>(null);
  protected readonly catalog = signal<CatalogSummaryView | null>(null);
  protected readonly entities = signal<readonly LegalEntityView[]>([]);
  protected readonly cycle = signal<BillingCycleView | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /**
   * L'échec du cycle a son propre message, et il est **partiel** : la barre
   * disparaît, le reste du tableau de bord tient. Le fondre dans `error` aurait
   * fait passer une bande manquante pour un tableau de bord illisible.
   */
  protected readonly cycleError = signal<string | null>(null);

  protected readonly windowDays = NEW_CUSTOMER_WINDOW_DAYS;

  /**
   * L'émetteur qui pourrait encaisser, s'il y en a un.
   *
   * Le PREMIER capable, et non « toutes les entités » : prélever demande UN
   * émetteur prêt, pas que tous le soient. Une seconde entité en cours de
   * montage ne doit pas faire dire que rien ne peut partir.
   */
  protected readonly issuer = computed(
    () => this.entities().find((entity) => entity.canCollect) ?? null,
  );

  /** Ce qui manque au plus avancé des émetteurs — de quoi nommer le geste suivant. */
  protected readonly issuerGap = computed(() => {
    const alive = this.entities().filter((entity) => entity.archivedAt === null);
    if (alive.length === 0) {
      return 'aucune entité juridique déclarée';
    }
    // Le plus avancé, c'est-à-dire celui à qui il manque le moins : c'est de
    // lui qu'on est le plus près, donc lui que la phrase doit désigner.
    const closest = [...alive].sort(
      (left, right) => left.missingToCollect.length - right.missingToCollect.length,
    )[0];
    return closest === undefined ? '' : closest.missingToCollect.join(', ');
  });

  /**
   * Le bandeau chiffré — quatre nombres, et le seul qui appelle un geste est
   * marqué.
   *
   * `tone: 'warning'` sur les articles sans taux de TVA : ils ne sont pas
   * masqués et ne sont pas vendables pour autant, donc ils disparaissent de la
   * boutique sans que rien ne le dise. C'est le seul chiffre de cet écran dont
   * une valeur non nulle est une mauvaise nouvelle.
   */
  protected readonly figures = computed(() => {
    const portfolio = this.customers();
    const shelf = this.catalog();
    return [
      { label: 'Clients actifs', value: portfolio?.active ?? 0, tone: null },
      {
        label: `Nouveaux sur ${String(this.windowDays)} j`,
        value: portfolio?.newlyActive ?? 0,
        tone: null,
      },
      { label: 'Articles en vente', value: shelf?.onSale ?? 0, tone: null },
      {
        label: 'Sans taux de TVA',
        value: shelf?.withoutVatRate ?? 0,
        tone: (shelf?.withoutVatRate ?? 0) > 0 ? 'warning' : null,
      },
    ];
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.cycleError.set(null);
    // Lancé avec les trois autres, mais **hors** du `Promise.all` : le cycle
    // n'est pas une condition du tableau de bord, et une 500 sur lui ne doit pas
    // effacer le portefeuille et le catalogue.
    const cycle = this.api.billingCycle().then(
      (view) => {
        this.cycle.set(view);
      },
      (caught: unknown) => {
        this.cycle.set(null);
        this.cycleError.set(httpErrorMessage(caught, 'Cycle de prélèvement illisible.'));
      },
    );
    try {
      // Ensemble : aucune ne dépend d'une autre, et les enchaîner tripleraient
      // l'attente pour rien.
      const [customers, catalog, entities] = await Promise.all([
        this.api.customers(),
        this.api.catalog(),
        this.entitiesApi.list(),
      ]);
      this.customers.set(customers);
      this.catalog.set(catalog);
      this.entities.set(entities);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Tableau de bord illisible.'));
    } finally {
      // Attendu ici plutôt qu'ignoré : la page ne quitte son état de chargement
      // qu'une fois la bande fixée, sinon elle apparaît puis se complète.
      await cycle;
      this.loading.set(false);
    }
  }

  protected async exportCustomers(): Promise<void> {
    await this.download(() => this.api.customersCsv(), 'comptes-clients.csv');
  }

  protected async exportCatalog(): Promise<void> {
    await this.download(() => this.api.catalogCsv(), 'catalogue-b2b.csv');
  }

  /**
   * Un export, et son échec DIT.
   *
   * Un téléchargement qui rate ne laisse aucune trace à l'écran — pas d'onglet,
   * pas de fichier, rien. Sans ce message, l'utilisateur reclique, et conclut
   * que le bouton ne marche pas.
   */
  private async download(load: () => Promise<Blob>, fileName: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      saveBlob(await load(), fileName);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Export impossible.'));
    } finally {
      this.busy.set(false);
    }
  }
}
