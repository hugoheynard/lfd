import { PermissionsStore } from '../../auth/permissions.store';
import { GestureIntents } from '../../shared/gesture-intents';
import { isBelowMinimumRefusal } from './below-minimum-refusal';
import { isGraceRefusal } from './grace-refusal';
import { isDeliveryClosedRefusal } from './delivery-closed-refusal';
import { isTotalChangedRefusal } from './total-changed-refusal';
import { estimateChangeMessage } from './estimate-changes';
import { OrderCutoffWaiversService } from '../order-cutoff-waivers.service';
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
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, tap } from 'rxjs';

import { buyerOf, composedDraftOf, placePayloadOf } from './draft-payload';
import {
  estimateKeyOf,
  estimatesOf,
  isBlockingRefusal,
  type EstimateRequest,
} from './order-estimate';
import {
  backLinkOf,
  COUNTER_PLACED_ORDER_KEY,
  destinationAfterPlacingOf,
  orderEntryOriginOf,
  type CounterHandoverOutcome,
  type CounterPlacedOrder,
} from './order-entry-origin';
import { HandoverQueueService } from '../../handover-shop/handover-queue.service';
import { HandoverQueueStore } from '../../handover-shop/handover-queue.store';
import { ResupplyReceiptsService } from '../../comptoir/reassort-boutique-page/resupply-receipts.service';
import { CounterDeliveryNoteService } from '../../comptoir/counter-delivery-note.service';
import { isoDayOf, shelfShortageOf, shelfStockBySku } from './immediate-pickup';

/**
 * L'accalmie au bout de laquelle on chiffre, en millisecondes.
 *
 * Assez court pour qu'un commercial au téléphone ne sente pas d'attente entre le
 * dernier chiffre tapé et le prix affiché ; assez long pour qu'une quantité
 * saisie à deux chiffres ne compte qu'une fois. Ce n'est pas un réglage : c'est
 * la durée d'une frappe, et elle ne dépend d'aucun environnement.
 */
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';
import {
  audienceOf,
  DEFAULT_DELIVERY_AVAILABILITY,
  type AdminOrderEstimateAmountsView,
  type AdminOrderEstimateView,
  type AdminOrderRow,
  type BillingAddressPayload,
  type DeliverySpecs,
  type CatalogItemView,
  type CustomerShelfPricesView,
  type CustomerSkuStat,
  type DeliveryAddressView,
  type DeliveryAvailabilityView,
  type DeliveryZoneView,
  type OrderDraftView,
  type OrderView,
  type PickupAddressView,
} from '@lfd/contracts';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import { DeliveryZonesService } from '../../b2b/reglages/delivery-zones.service';
import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { AdminCatalogService } from '../catalog.service';
import { loadShelfPrices } from './customer-shelf-prices';
import { AdminOrdersService } from '../orders.service';
import { OrderDraftsService } from '../order-drafts.service';
import {
  CommercialOrderEntrySource,
  CounterOrderEntrySource,
  type OrderEntrySource,
} from '../order-entry-sources';
import { serverMessageOf } from '../../production/server-message';
import type { OrderEntryBuyer, OrderEntryCustomer } from './order-entry-customer';
import { formatOrderInstant } from '@lfd/b2b-ui/order';
import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import { BarrePanier } from './barre-panier/barre-panier';
import { CartStore, saleLineOf } from './cart.store';
import { draftPayloadOf, draftSnapshotOf, restoreLines } from './draft-payload';
import { DraftStore } from './draft.store';
import { PanierPanel, type PanierPanelData } from './panier-panel/panier-panel';
import { PanierCommande, type OrderDraft } from './panier-commande/panier-commande';
import {
  SourceProduits,
  type ProposedLine,
  type SourceKind,
} from './source-produits/source-produits';

/** Où en est le chargement de l'écran. */
type LoadState = 'loading' | 'ready' | 'error';

/** Combien de commandes passées la colonne de gauche propose comme modèles. */
const HISTORY_SIZE = 30;

/**
 * Les consignes d'une adresse ajoutée depuis une commande : **vides**. On tient
 * ce qui a été dicté, rien de plus ; les créneaux et le contact de livraison se
 * renseignent depuis la fiche, où on les voit tous.
 */
const EMPTY_SPECS: DeliverySpecs = {
  // Réglage du site, préremplissage d'une commande — pas une contrainte.
  signatureRequired: false,
  note: '',
  slotList: { mode: 'everyday', slots: [] },
  deliveryContact: null,
  gps: null,
};

/** Sous cette largeur, le panier passe en tiroir (cf. `narrow`). */
const CART_DRAWER_MEDIA = '(max-width: 1279px)';

/**
 * **Saisir une commande pour un client** — l'écran du commercial au téléphone.
 *
 * Deux colonnes, et leur ordre est la thèse : à gauche ce qu'on peut ajouter
 * (le catalogue, ses commandes, ses habitudes), à droite le panier. On lit de
 * gauche à droite comme se déroule l'appel — « la même que mardi », « ajoute-moi
 * deux baguettes », « c'est tout ».
 *
 * L'historique a eu sa propre colonne ; elle occupait un tiers de la largeur en
 * permanence pour servir une source sur trois. Elle est devenue le volet gauche
 * de l'onglet qui la concerne.
 *
 * **Une page pleine et non un panneau**, comme le dossier de rendez-vous : on y
 * travaille dix minutes avec le client en ligne, elle a une adresse, elle
 * survit à un rafraîchissement, et elle a besoin de toute la largeur. Un tiroir
 * obligerait à choisir entre le catalogue et le panier.
 *
 * La société vient de la route : l'écran ne demande jamais « pour qui ? » — on y
 * arrive depuis la fiche du client, qui est le seul endroit d'où la question a
 * déjà une réponse.
 */

/** Le sujet de l'intention de passer : une seule passation par écran. */
const PLACE_INTENT = 'place';

@Component({
  selector: 'app-nouvelle-commande-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BarrePanier,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    PanierCommande,
    SourceProduits,
  ],
  templateUrl: './nouvelle-commande-page.html',
  styleUrl: './nouvelle-commande-page.scss',
})
export class NouvelleCommandePage {
  readonly id = input.required<string>();

  private readonly companies = inject(AdminCompaniesService);
  private readonly orders = inject(AdminOrdersService);
  /**
   * L'intention de passer la commande : une clé tirée au premier clic sur
   * « Valider », renvoyée tant que la passation n'a pas abouti (un double clic
   * rend la même commande), oubliée au succès.
   */
  private readonly placeIntents = new GestureIntents();
  private readonly waivers = inject(OrderCutoffWaiversService);
  private readonly permissions = inject(PermissionsStore);
  private readonly catalogService = inject(AdminCatalogService);
  private readonly pickupsService = inject(PickupAddressesService);
  private readonly zonesService = inject(DeliveryZonesService);
  private readonly draftsService = inject(OrderDraftsService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly router = inject(Router);
  private readonly receipts = inject(ResupplyReceiptsService);
  private readonly handovers = inject(HandoverQueueService);
  private readonly counterNotes = inject(CounterDeliveryNoteService);

  /**
   * D'où l'on saisit : le Commercial (défaut) ou le Comptoir, lu dans la `data`
   * de la route. Au comptoir, aucun lien ne sort de `/comptoir`.
   */
  protected readonly origin = orderEntryOriginOf(inject(ActivatedRoute).snapshot.data);

  /**
   * D'où vient le client : la fiche au Commercial, les lectures du comptoir au
   * Comptoir. Choisie une fois, à la construction — l'origine ne change pas.
   */
  private readonly customerSource: OrderEntrySource =
    this.origin === 'counter'
      ? inject(CounterOrderEntrySource)
      : inject(CommercialOrderEntrySource);

  /**
   * La bande du comptoir, d'où vient le point du « Retrait immédiat » (lot
   * L6). Lue seulement au comptoir ET avec le droit de remettre : sans lui,
   * l'injecter ferait lire la file du retrait pour se prendre un 403.
   */
  private readonly counterQueue =
    this.origin === 'counter' && this.permissions.can('handover_counter:write')
      ? inject(HandoverQueueStore, { optional: true })
      : null;

  /** Le point du comptoir quand le raccourci est proposé ; `null` sinon. */
  protected readonly counterPlaceId = computed(() => this.counterQueue?.activePlace()?.id ?? null);

  /** Le raccourci est-il choisi ? */
  protected readonly immediate = computed(
    () => this.counterPlaceId() !== null && this.draft.entry() === 'immediate',
  );

  /**
   * Le reste du jour au point du comptoir, par SKU (grammes au poids) —
   * `null` tant qu'il n'est pas lu. Lu à l'entrée dans le raccourci.
   */
  protected readonly shelfLeft = signal<ReadonlyMap<string, number> | null>(null);
  protected readonly shelfFailed = signal(false);

  /** Au retrait immédiat, le catalogue se réduit à ce qui reste en vitrine. */
  protected readonly shownCatalogue = computed<readonly CatalogItemView[]>(() => {
    if (!this.immediate()) {
      return this.catalogue();
    }
    const left = this.shelfLeft();
    return left === null ? [] : this.catalogue().filter((item) => left.has(item.sku));
  });

  /** Ce qui empêche de remettre depuis la vitrine — relayé au panier. */
  protected readonly shelfIssue = computed<string | null>(() => {
    if (this.shelfFailed()) {
      return 'Le stock de la vitrine n’a pas pu être lu — réessayez, ou passez une commande programmée.';
    }
    const left = this.shelfLeft();
    return left === null
      ? 'Lecture du stock de la vitrine…'
      : shelfShortageOf(this.cart.lines(), left);
  });

  /** La case « enregistrer au carnet » n'existe que si la source peut l'honorer. */
  protected readonly canKeepAddress = this.customerSource.keepsAddresses;

  /**
   * Le refus du serveur à l'ouverture, quand il en a dit un — au comptoir, le
   * 404 d'un client inconnu ou inactif invite à contacter le service commercial.
   */
  protected readonly loadError = signal<string | null>(null);

  /** Le retour de l'en-tête — le dossier du compte, ou le sélecteur du comptoir. */
  protected readonly back = computed(() => backLinkOf(this.origin, this.id()));

  /**
   * Le panier de CET écran. Une instance par page, jamais un service racine :
   * deux onglets ouverts sur deux clients ne doivent pas se partager un panier.
   */
  protected readonly cart = new CartStore();
  /** Les décisions qui ne sont pas des articles. Même portée que le panier. */
  protected readonly draft = new DraftStore();

  /**
   * Écran étroit ⇒ le panier passe en tiroir, derrière la barre du bas. La
   * largeur est lue en TypeScript et non en CSS : c'est elle qui décide si la
   * colonne est **rendue**, pas seulement si on la voit.
   *
   * Seuil PROPRE à cet écran, plus large que celui du back-office : la colonne
   * du panier n'est que le tiers du contenu, et sur un iPad mini à
   * l'horizontale (1133 px, menu ouvert) elle tombait à ~280 px — onglets
   * coupés, réglages écrasés (Hugo, 2026-11-03). Sous 1280 px, le tiroir
   * (~490 px) le sert mieux.
   */
  protected readonly narrow = narrowViewport(CART_DRAWER_MEDIA);

  protected readonly state = signal<LoadState>('loading');
  protected readonly company = signal<OrderEntryCustomer | null>(null);
  protected readonly history = signal<readonly AdminOrderRow[]>([]);
  protected readonly catalogue = signal<readonly CatalogItemView[]>([]);
  protected readonly habits = signal<readonly CustomerSkuStat[]>([]);
  /** Les prix du rayon de ce client, posés sur la liste ; `null` si illisibles. */
  protected readonly shelfPrices = signal<CustomerShelfPricesView | null>(null);
  /** Le bandeau quand la table n'a pas pu être lue : la liste reste au prix d'étiquette. */
  protected readonly shelfPricesIssue = signal<string | null>(null);
  protected readonly buyers = computed<readonly OrderEntryBuyer[]>(
    () => this.company()?.buyers ?? [],
  );
  protected readonly pickups = signal<readonly PickupAddressView[]>([]);
  protected readonly zones = signal<readonly DeliveryZoneView[]>([]);
  /** À quelles clientèles la livraison est proposée — le coursier en dépend. */
  protected readonly deliveryAvailability = signal<DeliveryAvailabilityView>(
    DEFAULT_DELIVERY_AVAILABILITY,
  );
  protected readonly submitting = signal(false);

  /**
   * La saisie **refusée pour cause d'heure limite, mais encore rattrapable**.
   *
   * On garde le brouillon plutôt que de demander au commercial de tout
   * ressaisir : il a le client en ligne, et le refus arrive au moment le plus
   * coûteux pour lui. `null` = rien à rattraper.
   */
  protected readonly lateDraft = signal<OrderDraft | null>(null);
  protected readonly waiverReason = signal('');
  protected readonly granting = signal(false);

  /**
   * Le droit d'accorder une dérogation est **distinct** de celui de saisir : la
   * ressource `b2b_order_waivers` existe pour ça. On le relit avant de proposer
   * le geste — un bouton qui répondrait 403 vaut moins qu'un bouton absent, et
   * la phrase du refus dit alors à qui s'adresser.
   */
  protected readonly canWaive = computed(() => this.permissions.can('b2b_order_waivers:write'));

  /** Un motif réel, comme le serveur l'exige. « ok » n'explique rien. */
  protected readonly waiverReady = computed(
    () => this.waiverReason().trim().length >= 5 && !this.granting(),
  );
  protected readonly savingDraft = signal(false);
  /** Le brouillon repris à l'ouverture, pour le dire à l'écran. Vide sinon. */
  protected readonly resumedAt = signal('');

  /**
   * La source ouverte. Le **catalogue** par défaut : c'est la seule qui a
   * toujours quelque chose à montrer, y compris devant un compte qui n'a jamais
   * commandé.
   */
  protected readonly source = signal<SourceKind>('catalogue');
  protected readonly selectedOrderId = signal<string | null>(null);
  protected readonly selectedOrder = signal<OrderView | null>(null);

  /** Le carnet de livraison du compte — vide tant que la fiche n'en porte aucune. */
  protected readonly addresses = computed(() => this.company()?.addresses ?? []);

  /**
   * La clientèle de la société : pro si elle est active, suspendue ou en
   * attente (2026-11-05), particulier si elle est close (Q3 du plan). La même fonction que le serveur — deux définitions de « qui
   * est pro » finiraient par proposer un coursier que la commande refuse.
   */
  protected readonly audience = computed(() => audienceOf(this.company()?.status ?? null));
  /** Le point préféré du client — la présélection du retrait en part (2026-10-15). */
  protected readonly preferredPickupId = computed(() => this.company()?.preferredPickupId ?? null);

  protected readonly companyName = computed(() => {
    return this.company()?.displayName ?? '';
  });

  /**
   * La société règle-t-elle au compte ? Dit par la source (cf.
   * `OrderEntryCustomer`). L'écran s'en sert seulement pour ne pas proposer un
   * bouton qui échouerait ; c'est le serveur qui décide.
   */
  protected readonly settlesOnAccount = computed(() => this.company()?.settlesOnAccount ?? false);

  /**
   * Le « Lien de règlement » est-il proposé ? Pas au comptoir (E4, Hugo,
   * 2026-11-03) : règlement au compte seulement, et le serveur le refuse.
   */
  protected readonly linkOffered = this.origin !== 'counter';

  /**
   * **La commande qu'on passerait**, quand la saisie est assez complète pour
   * se composer — la même définition que la validation (`composedDraftOf`).
   */
  private readonly composedDraft = computed(() =>
    composedDraftOf({
      buyerUserId: buyerOf(this.draft.buyerUserId(), this.buyers()),
      fulfillment: this.draft.fulfillment(),
      requestedDate: this.draft.requestedDate(),
      note: this.draft.note(),
      settlement: this.draft.settlement(),
      immediate: this.immediate(),
      empty: this.cart.isEmpty(),
    }),
  );

  /** Le corps à estimer — celui même de la passation — et sa clé ; `null` avant. */
  private readonly estimateRequest = computed<EstimateRequest | null>(() => {
    const draft = this.composedDraft();
    if (draft === null) {
      return null;
    }
    const payload = placePayloadOf(this.id(), draft, this.cart.toPayloadLines(), this.origin);
    return { key: estimateKeyOf(payload), payload };
  });

  /** L'estimation du serveur (lot P2), gardée jusqu'à la suivante — cf. `estimatesOf`. */
  protected readonly estimate = signal<AdminOrderEstimateView | null>(null);
  /** La clé de la saisie à laquelle {@link estimate} répond. */
  private readonly estimatedKey = signal<string | null>(null);

  /**
   * **L'estimation répond-elle à la saisie COURANTE ?** (Hugo, 2026-11-03,
   * plan total vu T3) — la validation est grisée tant qu'une estimation est
   * en vol ou absente : c'est son total qui part comme total vu, et un autre
   * que celui qu'on montre ne doit pas partir.
   */
  protected readonly estimateReady = computed(() => {
    const request = this.estimateRequest();
    return request !== null && this.estimate() !== null && this.estimatedKey() === request.key;
  });

  /**
   * **Le total a changé à la passation** (409, T3) : le message, terme à
   * terme, et la saisie à repasser au nouveau total. `null` sans écart.
   */
  protected readonly totalChange = signal<{
    readonly draft: OrderDraft;
    readonly message: string;
  } | null>(null);

  constructor() {
    effect(() => {
      void this.load(this.id());
    });

    // Le stock de la vitrine se relit à l'entrée dans le raccourci, et quand
    // le point de la bande change.
    effect(() => {
      const placeId = this.counterPlaceId();
      if (this.immediate() && placeId !== null) {
        untracked(() => void this.loadShelf(placeId));
      }
    });

    // Le prix de ce client vient de l'estimation, et d'elle seule : le devis
    // sans acheminement qui le donnait avant a quitté la saisie le 2026-11-04
    // (É16). Il ne voyait ni le jour ni le mode, donc ni la promotion du jour.
    this.watchEstimate();
  }

  /**
   * **Ce que la saisie coûterait** (lot P2), dès qu'elle compose une commande :
   * 400 ms d'accalmie, la requête en vol annulée au changement suivant, et
   * seulement quand le corps entier change. Cf. `order-estimate.ts`.
   */
  private watchEstimate(): void {
    estimatesOf(toObservable(this.estimateRequest), (payload, key) =>
      this.orders.estimate(payload).pipe(tap(() => this.estimatedKey.set(key))),
    )
      .pipe(takeUntilDestroyed())
      .subscribe((estimate) => {
        this.estimate.set(estimate);
      });
  }

  /** Le reste du jour au point, rapporté au catalogue de la saisie. */
  protected async loadShelf(placeId: string): Promise<void> {
    this.shelfLeft.set(null);
    this.shelfFailed.set(false);
    try {
      const receipt = await this.receipts.read(placeId, isoDayOf(new Date()));
      if (placeId === this.counterPlaceId()) {
        this.shelfLeft.set(shelfStockBySku(receipt.stock, this.catalogue()));
      }
    } catch {
      this.shelfFailed.set(true);
    }
  }

  protected retryShelf(): void {
    const placeId = this.counterPlaceId();
    if (placeId !== null) {
      void this.loadShelf(placeId);
    }
  }

  protected async load(companyId: string): Promise<void> {
    this.state.set('loading');
    this.loadError.set(null);
    try {
      // Sept lectures indépendantes : les enchaîner aurait multiplié l'attente
      // par sept devant un commercial qui a le client en ligne. Seules les
      // zones attendent le client : leur frais est celui de SA clientèle (0c).
      const customer = this.customerSource.customer(companyId);
      const [
        company,
        history,
        catalogue,
        habits,
        pickups,
        zones,
        saved,
        deliveryAvailability,
        shelfPrices,
      ] = await Promise.all([
        customer,
        this.orders.list({ companyId, limit: HISTORY_SIZE }).then((page) => page.rows),
        this.catalogService.list(),
        this.catalogService.habitsOf(companyId),
        this.pickupsService.listFor(companyId),
        customer.then((found) => this.zonesService.listFor(audienceOf(found?.status ?? null))),
        this.draftsService.find(companyId),
        // Illisible = le défaut du contrat, ouverte aux deux (plan, §4) : le
        // serveur refuse de toute façon une livraison fermée, et ce refus-là
        // est montré. Faire tomber tout l'écran pour ce réglage serait
        // disproportionné devant un client en ligne.
        this.customerSource.deliveryAvailability().catch(() => DEFAULT_DELIVERY_AVAILABILITY),
        // Ne rejette jamais : sans elle, la liste reste au prix d'étiquette et le dit.
        loadShelfPrices(() => this.catalogService.shelfPricesOf(companyId)),
      ]);
      if (company === undefined) {
        this.state.set('error');
        return;
      }
      this.company.set(company);
      this.history.set(history);
      this.catalogue.set(catalogue);
      this.habits.set(habits);
      this.shelfPrices.set(shelfPrices.prices);
      this.shelfPricesIssue.set(shelfPrices.failure);
      this.pickups.set(pickups);
      this.zones.set(zones);
      this.deliveryAvailability.set(deliveryAvailability);
      // Le règlement se pré-remplit par le payeur (plan du jour J §11.3) : au
      // compte s'il y a droit, le lien sinon. Un brouillon repris garde le sien.
      // Au comptoir, le lien n'est pas proposé (E4) : au compte, toujours.
      this.draft.settlement.set(company.settlesOnAccount || !this.linkOffered ? 'account' : 'link');
      this.resume(saved, catalogue, company.addresses);
      this.state.set('ready');
    } catch (error) {
      // Le message du serveur quand il y en a un (le 404 du comptoir), le
      // sous-titre générique sinon.
      this.loadError.set(error instanceof HttpErrorResponse ? serverMessageOf(error) : null);
      this.state.set('error');
    }
  }

  /**
   * Reprend le brouillon mis de côté pour ce compte, s'il y en a un. Silencieux
   * quand il n'y en a pas ; annoncé quand il y en a, parce qu'un panier qui se
   * remplit tout seul demande une explication.
   *
   * Les lignes sont **re-résolues au catalogue du jour** : une saisie de la
   * semaine dernière ne doit pas rouvrir sur un tarif périmé. Ce que le catalogue
   * ne connaît plus est retiré, et dit.
   */
  private resume(
    saved: OrderDraftView | null,
    catalogue: readonly CatalogItemView[],
    addresses: readonly DeliveryAddressView[],
  ): void {
    if (saved === null) {
      return;
    }
    const { lines, dropped } = restoreLines(saved, catalogue);
    this.cart.restore(lines);
    this.draft.restore(draftSnapshotOf(saved, addresses));
    this.resumedAt.set(formatOrderInstant(saved.savedAt));
    if (dropped.length > 0) {
      this.notify.info(
        `${dropped.length} ligne(s) du brouillon ne sont plus au catalogue : ${dropped.join(', ')}.`,
      );
    }
  }

  /** Met la saisie de côté, sur le compte — reprise depuis n'importe quel poste. */
  protected async onSaveDraft(): Promise<void> {
    this.savingDraft.set(true);
    try {
      const view = await this.draftsService.save(
        this.id(),
        draftPayloadOf(this.draft.snapshot(), this.cart.lines(), this.addresses()),
      );
      this.resumedAt.set(formatOrderInstant(view.savedAt));
      this.notify.success('Brouillon enregistré.');
    } catch {
      this.notify.error(null, "Le brouillon n'a pas pu être enregistré.");
    } finally {
      this.savingDraft.set(false);
    }
  }

  /** Jette le brouillon, et repart d'un écran vide. */
  protected async onDropDraft(): Promise<void> {
    this.cart.clear();
    this.draft.reset();
    this.resumedAt.set('');
    try {
      await this.draftsService.discard(this.id());
    } catch {
      this.notify.error(null, "Le brouillon n'a pas pu être effacé.");
    }
  }

  /**
   * Ouvre le panier en tiroir (mobile). Le panneau ne poste pas : il **ferme en
   * rendant** le brouillon, et la page enchaîne — c'est elle qui tient le service
   * et l'état d'envoi.
   */
  protected async openPanier(): Promise<void> {
    const company = this.company();
    if (company === null) {
      return;
    }
    // Toujours par le bas (Hugo, 2026-11-03) : le tiroir ne s'ouvre que sous
    // 1280 px, téléphone et tablette, et la feuille monte jusqu'à la barre.
    const ref = this.panels.open<PanierPanelData, OrderDraft>(PanierPanel, {
      side: 'bottom',
      // Opaque : un formulaire long ne se lit pas par-dessus le menu.
      surface: 'solid',
      data: {
        cart: this.cart,
        draft: this.draft,
        companyName: this.companyName(),
        buyers: this.buyers(),
        pickups: this.pickups(),
        addresses: this.addresses(),
        zones: this.zones(),
        deliveryAvailability: this.deliveryAvailability(),
        audience: this.audience(),
        preferredPickupId: this.preferredPickupId(),
        settlesOnAccount: this.settlesOnAccount(),
        canKeepAddress: this.canKeepAddress,
        counterPlaceId: this.counterPlaceId(),
        shelfIssue: this.shelfIssue,
        estimate: this.estimate.asReadonly(),
        estimateReady: this.estimateReady,
        linkOffered: this.linkOffered,
      },
    });
    const placed = await ref.closed;
    if (placed !== undefined) {
      await this.onPlace(placed);
    }
  }

  /** Ouvre une commande passée comme source : c'est « la même que mardi ». */
  protected async onSelectOrder(orderId: string): Promise<void> {
    this.selectedOrderId.set(orderId);
    this.source.set('commande');
    try {
      this.selectedOrder.set(await this.orders.byId(orderId));
    } catch {
      this.selectedOrder.set(null);
      this.notify.error(null, "Cette commande n'a pas pu être relue.");
    }
  }

  protected onAdd(line: ProposedLine): void {
    this.cart.add(
      {
        sku: line.product.id,
        name: line.product.name,
        unitPriceMillicents: line.unitPriceMillicents,
        // Au poids (P5) : la quantité est en grammes, au pas et au minimum de l'article.
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

  /**
   * Accorde la dérogation, puis **repasse la commande**.
   *
   * Deux appels et pas un : la dérogation est un objet à elle, avec son droit,
   * son motif et son auteur. La glisser dans la charge de la commande l'aurait
   * rendue invisible — et aurait donné le pouvoir de déroger à quiconque peut
   * saisir.
   */
  protected async onWaiveAndPlace(): Promise<void> {
    const draft = this.lateDraft();
    if (draft === null || !this.waiverReady()) {
      return;
    }
    this.granting.set(true);
    try {
      await this.waivers.grant({
        companyId: this.id(),
        fulfillmentDate: draft.requestedDeliveryDate,
        reason: this.waiverReason().trim(),
      });
    } catch (error) {
      this.notify.error(error, "La dérogation n'a pas pu être accordée.");
      this.granting.set(false);
      return;
    }
    this.granting.set(false);
    // 🔴 Plus de passation d'enchaînement (plan total vu, T3) : la dérogation
    // ouvre la surtaxe de retard, et l'estimation sous refus n'avait montré
    // aucun total. Une commande ne naît jamais à un montant qu'on n'a pas vu :
    // l'estimation se redemande, le panier montre le total, et le commercial
    // valide.
    this.lateDraft.set(null);
    this.waiverReason.set('');
    await this.freshEstimate();
    this.notify.success('Dérogation accordée. Vérifiez le total, puis validez la commande.');
  }

  protected onWaiverReason(event: Event): void {
    this.waiverReason.set((event.target as HTMLInputElement).value);
  }

  /** Referme le rattrapage : le commercial choisit une autre date. */
  protected onDismissLate(): void {
    this.lateDraft.set(null);
    this.waiverReason.set('');
  }

  protected async onPlace(draft: OrderDraft): Promise<void> {
    const estimate = this.estimate();
    // La validation est grisée sans estimation courante (T3) ; la garde tient
    // aussi si on l'appelle autrement.
    if (!this.estimateReady() || estimate === null) {
      return;
    }
    this.totalChange.set(null);
    const amounts = estimate.amounts;
    if (amounts === null) {
      // L'heure limite est passée mais rattrapable : l'estimation l'a dit sans
      // total. Le rattrapage se propose sans passer par le serveur — il n'y a
      // aucun total vu à envoyer.
      if (estimate.refusal !== null && !isBlockingRefusal(estimate.refusal)) {
        this.lateDraft.set(draft);
      }
      return;
    }
    this.submitting.set(true);
    try {
      const placed = await this.orders.place(
        {
          ...placePayloadOf(this.id(), draft, this.cart.toPayloadLines(), this.origin),
          // Le TTC de l'estimation affichée : la passation refuse un autre total.
          expectedTotalCents: amounts.totalCents,
        },
        this.placeIntents.keyFor(PLACE_INTENT),
      );
      this.placeIntents.done(PLACE_INTENT);
      this.cart.clear();
      // La commande est partie : le brouillon mis de côté n'a plus d'objet, et
      // le laisser ferait rouvrir l'écran sur une commande déjà passée. Son
      // effacement ne conditionne pas le reste — la commande, elle, est passée.
      this.draft.reset();
      this.resumedAt.set('');
      void this.draftsService.discard(this.id()).catch(() => undefined);
      // Le carnet APRÈS la commande : une adresse enregistrée pour une commande
      // qui n'est pas passée serait une trace de rien.
      if (this.canKeepAddress && draft.saveAddressToBook && draft.deliveryAddress !== null) {
        await this.keepAddress(draft.deliveryAddress);
      }
      // Le lien de règlement est copié plutôt qu'affiché en passant : le
      // commercial a le client en ligne, et le canal e-mail n'a pas encore fait
      // ses preuves en production.
      if (placed.paymentUrl !== undefined) {
        await this.copy(placed.paymentUrl);
      }
      this.lateDraft.set(null);
      this.waiverReason.set('');
      this.notify.success(`Commande ${placed.orderNumber} enregistrée.`);
      const handover = draft.immediate ? await this.handOver(placed.id, placed.orderNumber) : null;
      await this.leaveAfterPlacing(
        placed.id,
        placed.orderNumber,
        placed.paymentUrl ?? null,
        handover,
      );
    } catch (error) {
      // Le refus « encore rattrapable » n'est pas une panne : on garde la saisie
      // et on propose le geste, plutôt qu'un toast qui laisse le commercial
      // deviner ce qu'il peut faire.
      if (isTotalChangedRefusal(error)) {
        // Le total a bougé depuis l'estimation : pas une panne, un écart à
        // montrer avant de confirmer (T3).
        this.lateDraft.set(null);
        await this.showTotalChange(draft, amounts);
      } else if (isGraceRefusal(error)) {
        this.lateDraft.set(draft);
        this.notify.refused(error, "L'heure limite est passée pour cette date.");
      } else if (isDeliveryClosedRefusal(error)) {
        // La livraison a été fermée pendant la saisie. Le refus se dit, et le
        // réglage se relit : le coursier se grise alors avec sa raison, et le
        // commercial bascule en retrait sans rien ressaisir.
        this.lateDraft.set(null);
        this.notify.refused(
          error,
          "La livraison n'est pas proposée pour ce compte. Choisissez le retrait.",
        );
        void this.refreshDeliveryAvailability();
      } else if (isBelowMinimumRefusal(error)) {
        // Le message du serveur nomme l'article et son minimum : la saisie
        // reste, le commercial relève la ligne.
        this.lateDraft.set(null);
        this.notify.refused(error, "Une ligne est sous la quantité minimale de l'article.");
      } else {
        this.lateDraft.set(null);
        this.notify.error(error, "La commande n'a pas pu être enregistrée.");
      }
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * **L'écart de total, dit en un message** (T3) : une estimation neuve, comparée
   * terme à terme à celle qu'on montrait. Un écart nul ne dit rien.
   */
  private async showTotalChange(
    draft: OrderDraft,
    before: AdminOrderEstimateAmountsView,
  ): Promise<void> {
    const after = await this.freshEstimate();
    if (after === null) {
      this.notify.error(null, "Le total a changé, et la nouvelle estimation n'a pas pu être lue.");
      return;
    }
    const message = estimateChangeMessage(before, after);
    this.totalChange.set(message === null ? null : { draft, message });
  }

  /** « Modifier la saisie » : l'écart n'est plus à confirmer. */
  protected onDismissTotalChange(): void {
    this.totalChange.set(null);
  }

  /**
   * **Redemande l'estimation de la saisie courante, et l'attend** — le flux
   * ordinaire ne redemande rien tant que le corps ne change pas, et c'est le
   * serveur qui a bougé. Elle remplace l'estimation affichée si la saisie n'a
   * pas changé entre-temps.
   */
  private async freshEstimate(): Promise<AdminOrderEstimateAmountsView | null> {
    const request = this.estimateRequest();
    if (request === null) {
      return null;
    }
    try {
      const view = await firstValueFrom(this.orders.estimate(request.payload));
      if (this.estimateRequest()?.key === request.key) {
        this.estimate.set(view);
        this.estimatedKey.set(request.key);
      }
      return view.amounts;
    } catch {
      return null;
    }
  }

  /**
   * Quitte la saisie une fois la commande passée (cf. `destinationAfterPlacingOf`).
   * Au comptoir, le sélecteur reçoit la commande par l'état de navigation, pour
   * AFFICHER son lien de règlement : le client est en face.
   */
  private async leaveAfterPlacing(
    orderId: string,
    orderNumber: string,
    paymentUrl: string | null,
    handover: CounterHandoverOutcome | null,
  ): Promise<void> {
    const destination = destinationAfterPlacingOf(this.origin, this.id(), orderId);
    const placed: CounterPlacedOrder = { orderNumber, paymentUrl, handover };
    await this.router.navigate(
      destination,
      this.origin === 'counter' ? { state: { [COUNTER_PLACED_ORDER_KEY]: placed } } : {},
    );
  }

  /**
   * **« Valider et remettre »**, sa seconde moitié : la remise saisie
   * (`POST /admin/handover/manual/:orderNumber`, celle du bloc du retrait),
   * puis le bon de livraison de transport, non chiffré, à imprimer et faire
   * signer (Hugo, 2026-11-03). La commande est déjà passée : un refus de
   * remise ne l'annule pas, il se DIT — elle attend dans la file du retrait.
   */
  private async handOver(orderId: string, orderNumber: string): Promise<CounterHandoverOutcome> {
    try {
      await this.handovers.confirmManually(orderNumber);
    } catch (error) {
      const refusal = serverMessageOf(error);
      this.notify.info(`Commande ${orderNumber} passée, mais pas remise : ${refusal}`);
      return { orderId, refusal };
    }
    try {
      await this.counterNotes.openCarrier(orderId);
    } catch (error) {
      this.notify.info(
        `Commande ${orderNumber} remise, mais le bon n’a pas pu s’ouvrir : ${
          error instanceof Error ? error.message : ''
        } Réimprimez-le depuis le comptoir.`,
      );
    }
    return { orderId, refusal: null };
  }

  /** Relit le réglage de livraison ; un échec garde celui qu'on avait. */
  private async refreshDeliveryAvailability(): Promise<void> {
    try {
      this.deliveryAvailability.set(await this.customerSource.deliveryAvailability());
    } catch {
      // Rien à dire de plus : le refus vient d'être montré.
    }
  }

  /**
   * Ajoute au carnet l'adresse dictée. Son échec **ne remonte pas** en erreur de
   * commande : la commande, elle, est passée — annoncer le contraire enverrait le
   * commercial la ressaisir.
   */
  private async keepAddress(address: BillingAddressPayload): Promise<void> {
    try {
      await this.companies.addDelivery(this.id(), {
        ...address,
        isDefault: false,
        specs: EMPTY_SPECS,
      });
    } catch {
      this.notify.info("L'adresse n'a pas pu être ajoutée au carnet du compte.");
    }
  }

  /** Copie le lien, et le dit. L'échec n'est pas silencieux : le lien est perdu sinon. */
  private async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.notify.success('Lien de règlement copié — à transmettre au client.');
    } catch {
      this.notify.info(`Lien de règlement à transmettre : ${url}`);
    }
  }
}
