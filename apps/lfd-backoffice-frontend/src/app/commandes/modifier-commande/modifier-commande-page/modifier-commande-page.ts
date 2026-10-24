import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  audienceOf,
  DEFAULT_DELIVERY_AVAILABILITY,
  type AdminOrderView,
  type CatalogItemView,
  type CustomerSkuStat,
  type DeliveryAddressView,
  type DeliveryAvailabilityView,
  type DeliveryZoneView,
  type OrderRevisionChange,
  type OrderRevisionQuotePayload,
  type OrderRevisionQuoteView,
  type PickupAddressView,
} from '@lfd/contracts';
import { CartRow } from '@lfd/b2b-ui/cart';
import { formatCents } from '@lfd/b2b-ui/order';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { DeliveryZonesService } from '../../../b2b/reglages/delivery-zones.service';
import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { ORDER_REVISION_CHANGE } from '../../../shared/journal/values/orders-values';
import { AdminOrdersService } from '../../orders.service';
import { AdminCatalogService } from '../../catalog.service';
import { CommercialOrderEntrySource } from '../../order-entry-sources';
import {
  AcheminementCommande,
  type FulfillmentChoice,
} from '../../nouvelle-commande/acheminement-commande/acheminement-commande';
import { CartStore } from '../../nouvelle-commande/cart.store';
import { DraftStore } from '../../nouvelle-commande/draft.store';
import type { OrderEntryCustomer } from '../../nouvelle-commande/order-entry-customer';
import {
  SourceProduits,
  type ProposedLine,
  type SourceKind,
} from '../../nouvelle-commande/source-produits/source-produits';
import {
  bookAddressIdOf,
  revisionCartOf,
  revisionContentOf,
  revisionDraftOf,
} from '../revision-draft';

type LoadState = 'loading' | 'ready' | 'error';

/** Le refus « modifiée ailleurs » (R7) : on ne recalcule pas, on relit. */
const STALE_REVISION = 'orders.revise.stale_revision';

/** L'acheminement tant que le sélecteur n'a rien émis — le temps d'un rendu. */
const NO_FULFILLMENT: FulfillmentChoice = {
  method: 'pickup',
  pickupAddressId: null,
  deliveryAddress: null,
  saveToBook: false,
  window: null,
  issue: 'Acheminement non déterminé.',
};

/** Un devis, et la commande voulue qu'il chiffre — sérialisée pour comparer. */
interface QuotedRevision {
  readonly view: OrderRevisionQuoteView;
  readonly content: string;
}

/**
 * **Modifier une commande passée** — le parcours de l'équipe (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, §6, M3).
 *
 * La saisie par l'équipe, préremplie : les mêmes sources d'articles, le même
 * panier, le même sélecteur d'acheminement — seuls l'interlocuteur et le
 * règlement disparaissent, parce qu'ils ne changent pas (R2).
 *
 * **Le devis avant la validation, et lié à ce qu'il chiffre.** Un devis ne vaut
 * que pour la commande voulue qu'il a reçue : le moindre changement l'efface,
 * et « Valider » n'existe qu'avec un devis à jour. Sa révision part telle
 * quelle en `expectedRevision` ; si la commande a bougé ailleurs (409), on ne
 * recalcule pas par-dessus — on propose de relire.
 */
@Component({
  selector: 'app-modifier-commande-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AcheminementCommande,
    CartRow,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldTextareaComponent,
    RouterLink,
    SourceProduits,
  ],
  templateUrl: './modifier-commande-page.html',
  styleUrl: './modifier-commande-page.scss',
})
export class ModifierCommandePage {
  readonly orderId = input.required<string>();

  private readonly orders = inject(AdminOrdersService);
  private readonly catalogService = inject(AdminCatalogService);
  private readonly customers = inject(CommercialOrderEntrySource);
  private readonly pickupsService = inject(PickupAddressesService);
  private readonly zonesService = inject(DeliveryZonesService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly cart = new CartStore();
  protected readonly draft = new DraftStore();

  protected readonly state = signal<LoadState>('loading');
  protected readonly order = signal<AdminOrderView | null>(null);
  protected readonly customer = signal<OrderEntryCustomer | null>(null);
  protected readonly catalogue = signal<readonly CatalogItemView[]>([]);
  protected readonly habits = signal<readonly CustomerSkuStat[]>([]);
  protected readonly pickups = signal<readonly PickupAddressView[]>([]);
  protected readonly zones = signal<readonly DeliveryZoneView[]>([]);
  protected readonly deliveryAvailability = signal<DeliveryAvailabilityView>(
    DEFAULT_DELIVERY_AVAILABILITY,
  );
  protected readonly source = signal<SourceKind>('catalogue');
  protected readonly fulfillment = signal<FulfillmentChoice>(NO_FULFILLMENT);

  protected readonly quoting = signal(false);
  protected readonly submitting = signal(false);
  protected readonly quoted = signal<QuotedRevision | null>(null);
  /** Le dernier refus du serveur, dans ses mots. */
  protected readonly refusal = signal<string | null>(null);
  /** Le refus était « modifiée ailleurs » : seule la relecture en sort. */
  protected readonly stale = signal(false);

  protected readonly addresses = computed<readonly DeliveryAddressView[]>(
    () => this.customer()?.addresses ?? [],
  );
  protected readonly audience = computed(() => audienceOf(this.customer()?.status ?? null));
  protected readonly preferredPickupId = computed(() => this.customer()?.preferredPickupId ?? null);

  /** Le retour : la commande dans le dossier de son compte, sinon en pleine page. */
  protected readonly back = computed(() => {
    const order = this.order();
    const companyId = order?.companyId ?? null;
    return companyId === null
      ? ['/commandes', this.orderId()]
      : ['/comptes-clients', companyId, 'commandes', this.orderId()];
  });

  protected readonly title = computed(() => {
    const order = this.order();
    return order === null ? 'Modifier la commande' : `Modifier la commande ${order.orderNumber}`;
  });

  protected readonly dateLabel = computed(() =>
    this.fulfillment().method === 'delivery' ? 'Livraison souhaitée le' : 'Retrait souhaité le',
  );

  /** Ce qui empêche de demander le devis, dit en clair. */
  protected readonly blockers = computed<readonly string[]>(() => {
    const issues: string[] = [];
    if (this.cart.isEmpty()) {
      issues.push('Le panier est vide : pour tout retirer, annulez la commande.');
    }
    if (this.draft.requestedDate() === '') {
      issues.push('Aucun jour de retrait/livraison.');
    }
    const acheminement = this.fulfillment().issue;
    if (acheminement !== null) {
      issues.push(acheminement);
    }
    return issues;
  });

  /** La commande voulue, telle qu'elle partirait — `null` tant qu'elle est incomplète. */
  protected readonly content = computed<OrderRevisionQuotePayload | null>(() => {
    const order = this.order();
    if (order === null || this.blockers().length > 0) {
      return null;
    }
    return revisionContentOf(
      order,
      {
        fulfillment: this.fulfillment(),
        bookAddressId: bookAddressIdOf(this.draft.addressId(), this.addresses()),
        requestedDeliveryDate: this.draft.requestedDate(),
        note: this.draft.note(),
      },
      this.cart.lines(),
    );
  });

  /** Le devis, seulement s'il chiffre encore la commande voulue. */
  protected readonly quote = computed<OrderRevisionQuoteView | null>(() => {
    const quoted = this.quoted();
    const content = this.content();
    return quoted !== null && content !== null && quoted.content === JSON.stringify(content)
      ? quoted.view
      : null;
  });

  protected readonly changes = computed(() =>
    (this.quote()?.changes ?? []).map((change: OrderRevisionChange) => ({
      key: change,
      label: ORDER_REVISION_CHANGE.labels[change] ?? change,
    })),
  );

  /** « + 4,20 € » / « − 3,10 € » / « aucun » — le signe est le sujet. */
  protected readonly difference = computed(() => {
    const cents = this.quote()?.differenceCents ?? 0;
    if (cents === 0) {
      return 'Aucun';
    }
    return `${cents > 0 ? '+' : '−'} ${formatCents(Math.abs(cents))}`;
  });

  protected readonly cents = formatCents;

  constructor() {
    effect(() => {
      const id = this.orderId();
      untracked(() => void this.load(id));
    });
  }

  protected async load(id: string = this.orderId()): Promise<void> {
    this.state.set('loading');
    this.quoted.set(null);
    this.refusal.set(null);
    this.stale.set(false);
    try {
      const order = await this.orders.byId(id);
      const companyId = order.companyId;
      const [customer, catalogue, habits, pickups, zones, availability] = await Promise.all([
        companyId === null ? Promise.resolve(undefined) : this.customers.customer(companyId),
        this.catalogService.list(),
        companyId === null ? Promise.resolve([]) : this.catalogService.habitsOf(companyId),
        companyId === null ? this.pickupsService.list() : this.pickupsService.listFor(companyId),
        this.zonesService.list(),
        this.customers.deliveryAvailability().catch(() => DEFAULT_DELIVERY_AVAILABILITY),
      ]);
      this.order.set(order);
      this.customer.set(customer ?? null);
      this.catalogue.set(catalogue);
      this.habits.set(habits);
      this.pickups.set(pickups);
      this.zones.set(zones);
      this.deliveryAvailability.set(availability);
      this.cart.restore(revisionCartOf(order));
      this.draft.restore(revisionDraftOf(order, pickups, customer?.addresses ?? []));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected onAdd(line: ProposedLine): void {
    this.cart.add(
      {
        sku: line.product.id,
        name: line.product.name,
        unitPriceMillicents: line.unitPriceMillicents,
      },
      line.quantity,
    );
  }

  protected onAddAll(lines: readonly ProposedLine[]): void {
    for (const line of lines) {
      this.onAdd(line);
    }
  }

  protected async askQuote(): Promise<void> {
    const content = this.content();
    if (content === null) {
      return;
    }
    this.quoting.set(true);
    this.refusal.set(null);
    try {
      const view = await this.orders.quoteRevision(this.orderId(), content);
      this.quoted.set({ view, content: JSON.stringify(content) });
    } catch (error) {
      this.refuse(error, "Le devis n'a pas pu être calculé.");
    } finally {
      this.quoting.set(false);
    }
  }

  protected async validate(): Promise<void> {
    const content = this.content();
    const quote = this.quote();
    if (content === null || quote === null) {
      return;
    }
    this.submitting.set(true);
    this.refusal.set(null);
    try {
      const revised = await this.orders.revise(this.orderId(), {
        ...content,
        expectedRevision: quote.revision,
      });
      this.notify.success(`Commande modifiée — nouveau total ${formatCents(revised.totalCents)}.`);
      await this.router.navigate(this.back());
    } catch (error) {
      this.refuse(error, "La modification n'a pas abouti. Réessayez.");
    } finally {
      this.submitting.set(false);
    }
  }

  private refuse(error: unknown, fallback: string): void {
    this.stale.set(httpErrorCode(error) === STALE_REVISION);
    this.refusal.set(httpErrorMessage(error, fallback));
  }
}
