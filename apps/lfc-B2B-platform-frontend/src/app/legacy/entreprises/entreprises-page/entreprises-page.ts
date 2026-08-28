import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldViewNavComponent,
  type FoldViewNavItem,
} from 'fold-ng';

import { companyDisplayName } from '../../../account/account.model';
import { AccountService } from '../../../account/account.service';
import { CreerEntreprisePanel } from '../creer-entreprise-panel/creer-entreprise-panel';
import { EntrepriseDetail } from '../entreprise-detail/entreprise-detail';

/**
 * Page **Mes entreprises** — remplace l'ancienne « Mon profil », dont elle
 * reprend le contenu société. Le profil de la personne, lui, a rejoint les
 * Réglages.
 *
 * Trois états, dictés par le nombre d'entreprises :
 *   - **aucune** → empty state avec « Créer une entreprise ». C'est l'état de
 *     départ d'un compte, désormais représentable (avant, une personne portait
 *     obligatoirement une société) ;
 *   - **une** → la fiche directement, **sans barre** : un sélecteur d'un seul
 *     élément n'apporte rien et ajoute un niveau de navigation pour rien ;
 *   - **plusieurs** → une barre `fold-view-nav` (horizontale, remplie,
 *     transparente) qui bascule entre les fiches. Ce ne sont pas des routes :
 *     les items sont des boutons pilotés par `activeKey`, et on rend la fiche
 *     de l'entreprise active.
 */
@Component({
  selector: 'app-entreprises-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldEmptyStateComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    FoldViewNavComponent,
    EntrepriseDetail,
  ],
  templateUrl: './entreprises-page.html',
  styleUrl: './entreprises-page.scss',
})
export class EntreprisesPage {
  private readonly account = inject(AccountService);
  private readonly panelHost = inject(FoldPanelHostService);

  protected readonly companies = this.account.companies;
  protected readonly error = this.account.error;

  /**
   * Vrai seulement quand on **sait** qu'il n'y a aucune entreprise. Sans cette
   * nuance, l'empty state s'afficherait le temps du chargement, puis serait
   * remplacé — un clignotement qui suggère à tort qu'il n'y a rien.
   */
  protected readonly showEmptyState = this.account.hasNoCompany;

  /** Tant qu'on ne sait pas encore : ni fiche, ni empty state. */
  protected readonly loading = computed(
    () => this.account.status() === 'idle' || this.account.status() === 'loading',
  );

  /** L'unique entreprise, quand il n'y en a qu'une (pas d'onglet dans ce cas). */
  protected readonly single = computed(() =>
    this.companies().length === 1 ? (this.companies()[0] ?? null) : null,
  );

  /** Barre visible seulement à partir de deux entreprises. */
  protected readonly hasNav = computed(() => this.companies().length > 1);

  protected readonly navItems = computed<FoldViewNavItem[]>(() =>
    this.companies().map((company) => ({
      key: company.id,
      label: companyDisplayName(company),
      icon: 'company',
    })),
  );

  protected readonly activeKey = signal('');

  /** L'entreprise dont la fiche est affichée (celle que la barre désigne). */
  protected readonly activeCompany = computed(
    () => this.companies().find((company) => company.id === this.activeKey()) ?? null,
  );

  constructor() {
    // La sélection suit la liste : à la première charge comme après une création,
    // la clé courante peut ne désigner aucune entreprise (chaîne vide, ou société
    // disparue). On retombe alors sur la première, sinon aucune fiche ne serait
    // rendue.
    effect(() => {
      const keys = this.companies().map((company) => company.id);
      if (keys.length > 0 && !keys.includes(this.activeKey())) {
        this.activeKey.set(keys[0] ?? '');
      }
    });
  }

  /** Ouvre le panneau de création ; il se refermera seul en cas de succès. */
  protected create(): void {
    this.panelHost.open(CreerEntreprisePanel, { side: 'right' });
  }
}
