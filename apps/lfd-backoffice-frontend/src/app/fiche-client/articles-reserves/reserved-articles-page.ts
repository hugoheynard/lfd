import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type {
  CatalogAdminItemView,
  CompanyReservedArticlesView,
  ReservedArticleView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldComboboxComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import { RESERVED_VISIBILITY_LABELS, reservationDate } from '../../b2b/catalogue/made-to-order';
import { MadeToOrderService } from '../../b2b/catalogue/made-to-order.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Articles réservés** — l'onglet de la fiche client (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, § 7, lot L1a) : les
 * articles réservés à ce compte, qu'on ajoute et qu'on retire ici, et ceux de
 * son principal, en lecture seule (ils se retirent sur SA fiche).
 *
 * 🔴 Retirer une réservation est irréversible côté client une fois le mur en
 * place : l'article s'ouvre à tous les pros, nom et photo compris (§ 4). Le
 * geste se confirme, et la confirmation le dit.
 */
@Component({
  selector: 'app-client-reserved-articles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldComboboxComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './reserved-articles-page.html',
  styleUrl: './reserved-articles-page.scss',
})
export class ClientReservedArticlesPage {
  /** L'identifiant de la société, lié depuis le segment de route parent. */
  readonly id = input.required<string>();

  private readonly api = inject(MadeToOrderService);
  private readonly catalogue = inject(CatalogueService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  /** Réserver ou retirer : le droit du sur mesure (Hugo, 2026-10-30), pas celui du catalogue. */
  protected readonly canEdit = computed(() => this.permissions.can('lfc_made_to_order:write'));
  /**
   * Le sélecteur lit la liste du catalogue, servie sous `lfc_catalog:read` :
   * sans elle, on retire encore, on ne réserve pas.
   */
  protected readonly canReserve = computed(
    () => this.canEdit() && this.permissions.can('lfc_catalog:read'),
  );
  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<CompanyReservedArticlesView>({ own: [], principal: null });
  private readonly articles = signal<readonly CatalogAdminItemView[]>([]);
  /** Le SKU dont le geste est en vol — un seul à la fois. */
  protected readonly pending = signal<string | null>(null);

  protected readonly when = reservationDate;
  protected readonly releaseWarning =
    'Retirer cette réservation ? Dès que la restriction s’applique, l’article redevient visible et commandable par tous les professionnels — nom, photo et composition compris.';

  /** Les articles en vente qu'on peut encore réserver à ce compte. */
  protected readonly options = computed<readonly FoldSelectOption<string>[]>(() => {
    const taken = new Set(this.view().own.map((article) => article.sku));
    return this.articles()
      .filter((article) => !taken.has(article.sku))
      .map((article) => ({ value: article.sku, label: `${article.name} · ${article.sku}` }));
  });

  constructor() {
    // Un `input` de route n'est pas lié dans le constructeur ; l'effet attend la
    // liaison et rejoue si l'on passe d'un compte à un autre.
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(companyId: string): Promise<void> {
    this.state.set('loading');
    try {
      const [view, articles] = await Promise.all([
        this.api.ofCompany(companyId),
        this.canReserve() ? this.catalogue.list() : Promise.resolve([]),
      ]);
      this.view.set(view);
      this.articles.set(articles);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected visibility(article: ReservedArticleView): string {
    return RESERVED_VISIBILITY_LABELS[article.reservedVisibility];
  }

  protected async reserve(sku: string): Promise<void> {
    await this.act(sku, () => this.api.reserve(sku, this.id()), 'Article réservé à ce compte.');
  }

  protected async release(article: ReservedArticleView): Promise<void> {
    await this.act(
      article.sku,
      () => this.api.release(article.sku, this.id()),
      `${article.name} n’est plus réservé à ce compte.`,
    );
  }

  /** Un geste, puis la relecture : le serveur reste l'autorité ; un refus laisse la liste telle quelle. */
  private async act(sku: string, gesture: () => Promise<void>, done: string): Promise<void> {
    this.pending.set(sku);
    try {
      await gesture();
      this.notify.success(done);
      this.view.set(await this.api.ofCompany(this.id()));
    } catch (error) {
      this.notify.error(error, "La réservation n'a pas pu être modifiée.");
    } finally {
      this.pending.set(null);
    }
  }
}
