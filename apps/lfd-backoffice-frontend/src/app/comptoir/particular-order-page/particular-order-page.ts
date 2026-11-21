import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { httpErrorMessage } from '@lfd/endpoints';
import type {
  CatalogItemView,
  CounterParticularCard,
  CounterParticularOrderEstimatePayload,
  CounterParticularPlacedOrderResponse,
  CustomerShelfPricesView,
  FulfillmentWindow,
  PickupAddressView,
} from '@lfd/contracts';
import { formatCents } from '@lfd/b2b-ui/order';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';
import { tap } from 'rxjs';

import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { AdminCatalogService } from '../../commandes/catalog.service';
import { CartStore, saleLineOf } from '../../commandes/nouvelle-commande/cart.store';
import { tomorrowIso } from '../../commandes/nouvelle-commande/draft.store';
import {
  estimateKeyOf,
  estimatesOf,
  type EstimateRequest,
} from '../../commandes/nouvelle-commande/order-estimate';
import {
  SourceProduits,
  type ProposedLine,
  type SourceKind,
} from '../../commandes/nouvelle-commande/source-produits/source-produits';
import { orderEntryReturn } from '../../commandes/nouvelle-commande/order-entry-return';
import { GestureIntents } from '../../shared/gesture-intents';
import { CounterParticularsService } from '../counter-particulars.service';
import { ParticularCart } from '../particular-cart/particular-cart';
import {
  defaultPickupIdOf,
  particularEstimatePayloadOf,
  particularPickupsOf,
} from '../particular-order-draft';
import { ParticularPicker } from '../particular-picker/particular-picker';
import { particularShelfOf } from '../particular-shelf';

type LoadState = 'loading' | 'ready' | 'error';

/** Le sujet de l'intention de passer : une passation par geste. */
const PLACE_INTENT = 'place';

/**
 * **Nouvelle commande particulier, au comptoir** — à régler à la caisse de la
 * boutique (`commande-particulier-reglee-en-boutique.md`, § 2, § 3, § 5).
 *
 * D'abord LA personne, choisie à l'écran ; ensuite le panier, au retrait
 * seulement, au prix et aux promotions de son espace — la liste montre son
 * rayon public, le serveur les applique, le devis les confirme. Les briques sont celles de la saisie pro :
 * la colonne des articles, le panier, le flux du devis. Aucun champ de
 * règlement : notre système ne sait jamais que la commande est payée.
 */
@Component({
  selector: 'app-particular-order-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    ParticularCart,
    ParticularPicker,
    RouterLink,
    SourceProduits,
  ],
  templateUrl: './particular-order-page.html',
  styleUrl: './particular-order-page.scss',
})
export class ParticularOrderPage {
  private readonly api = inject(CounterParticularsService);
  private readonly catalogService = inject(AdminCatalogService);
  private readonly pickupsService = inject(PickupAddressesService);
  private readonly router = inject(Router);
  /**
   * D'où l'on vient, et le point du comptoir quand c'est lui qui a ouvert la
   * saisie : il devient le point par défaut. « Terminer » ramène à l'origine.
   */
  protected readonly origin = orderEntryReturn();
  private readonly placeIntents = new GestureIntents();

  protected readonly cart = new CartStore();
  protected readonly state = signal<LoadState>('loading');
  /** La liste : le rayon du particulier seul, jamais le catalogue entier. */
  protected readonly catalogue = signal<readonly CatalogItemView[]>([]);
  /** Ses prix : TTC et promotions publiques, tels que son espace les montre. */
  protected readonly shelfPrices = signal<CustomerShelfPricesView | null>(null);
  protected readonly pickups = signal<readonly PickupAddressView[]>([]);
  protected readonly source = signal<SourceKind>('catalogue');

  protected readonly person = signal<CounterParticularCard | null>(null);
  protected readonly pickupId = signal<string | null>(null);
  protected readonly requestedDate = signal(tomorrowIso());
  protected readonly window = signal<FulfillmentWindow | null>(null);
  protected readonly note = signal('');

  protected readonly submitting = signal(false);
  protected readonly placeError = signal<string | null>(null);
  protected readonly placed = signal<CounterParticularPlacedOrderResponse | null>(null);
  protected readonly cents = formatCents;

  /** Ce que la saisie demande au devis, ou `null` tant qu'elle n'est pas composable. */
  private readonly request =
    computed<EstimateRequest<CounterParticularOrderEstimatePayload> | null>(() => {
      const person = this.person();
      if (person === null) {
        return null;
      }
      const payload = particularEstimatePayloadOf(
        {
          buyerUserId: person.id,
          pickupAddressId: this.pickupId(),
          requestedDate: this.requestedDate(),
          window: this.window(),
          note: this.note(),
        },
        this.cart.toPayloadLines(),
      );
      return payload === null ? null : { key: estimateKeyOf(payload), payload };
    });
  /** La clé de la saisie à laquelle le devis affiché répond. */
  private readonly estimatedKey = signal<string | null>(null);
  protected readonly estimate = toSignal(
    estimatesOf(toObservable(this.request), (payload, key) =>
      this.api.estimate(payload).pipe(tap(() => this.estimatedKey.set(key))),
    ),
    { initialValue: null },
  );
  protected readonly estimateReady = computed(
    () => this.estimate() !== null && this.estimatedKey() === this.request()?.key,
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      // Sans son rayon, pas de liste : l'écran ne retombe jamais sur le
      // catalogue entier et ses prix d'étiquette.
      const [catalogue, prices, points] = await Promise.all([
        this.catalogService.list(),
        this.api.shelfPrices(),
        this.pickupsService.list(),
      ]);
      const open = particularPickupsOf(points);
      this.catalogue.set(particularShelfOf(catalogue, prices));
      this.shelfPrices.set(prices);
      this.pickups.set(open);
      const here = this.origin.point();
      // Le point du comptoir qui saisit ; sinon le seul ouvert ; sinon on choisit.
      const only = open.length === 1 ? (open[0]?.id ?? null) : null;
      this.pickupId.set(defaultPickupIdOf(open, here) ?? only);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected choose(card: CounterParticularCard): void {
    this.person.set(card);
  }

  /** Une autre personne : le panier reste, la personne se rechoisit. */
  protected changePerson(): void {
    this.person.set(null);
  }

  protected onAdd(line: ProposedLine): void {
    this.cart.add(
      {
        sku: line.product.id,
        name: line.product.name,
        unitPriceMillicents: line.unitPriceMillicents,
        ...saleLineOf(line.product),
      },
      line.quantity,
    );
  }

  protected onAddAll(lines: readonly ProposedLine[]): void {
    for (const line of lines) {
      this.onAdd(line);
    }
  }

  /** Valider : la passation, sous la clé de ce geste, au total que le devis a montré. */
  protected async onPlace(): Promise<void> {
    const request = this.request();
    const total = this.estimate()?.amounts?.totalCents ?? null;
    if (request === null || total === null || !this.estimateReady()) {
      return;
    }
    this.submitting.set(true);
    this.placeError.set(null);
    try {
      const placed = await this.api.place(
        { ...request.payload, expectedTotalCents: total },
        this.placeIntents.keyFor(PLACE_INTENT),
      );
      this.placeIntents.done(PLACE_INTENT);
      this.placed.set(placed);
    } catch (error: unknown) {
      this.placeError.set(httpErrorMessage(error, 'La commande n’a pas pu être notée. Réessayez.'));
    } finally {
      this.submitting.set(false);
    }
  }

  /** La commande est notée, le client servi : retour à l'écran d'où l'on vient. */
  protected finish(): void {
    void this.router.navigateByUrl(this.origin.target());
  }

  /** Le client suivant : tout repart de zéro, sauf le point du comptoir. */
  protected next(): void {
    this.placed.set(null);
    this.person.set(null);
    this.cart.clear();
    this.window.set(null);
    this.note.set('');
    this.requestedDate.set(tomorrowIso());
  }
}
