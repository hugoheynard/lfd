import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldBackLinkComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';
import {
  companyDisplayName,
  type AdminOrderRow,
  type BillingAddressPayload,
  type DeliverySpecs,
  type CompanyMemberView,
  type CatalogItemView,
  type CustomerSkuStat,
  type DeliveryZoneView,
  type OrderView,
  type PickupAddressView,
} from '@lfd/contracts';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import { DeliveryZonesService } from '../../reglages/retraits-livraisons/delivery-zones.service';
import { PickupAddressesService } from '../../reglages/retraits-livraisons/pickup-addresses.service';
import { AdminCatalogService } from '../catalog.service';
import { AdminOrdersService } from '../orders.service';
import { CartStore } from './cart.store';
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
  note: '',
  slots: { mode: 'everyday', slot: null },
  deliveryContact: null,
  gps: null,
};

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
@Component({
  selector: 'app-nouvelle-commande-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
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
  private readonly catalogService = inject(AdminCatalogService);
  private readonly pickupsService = inject(PickupAddressesService);
  private readonly zonesService = inject(DeliveryZonesService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  /**
   * Le panier de CET écran. Une instance par page, jamais un service racine :
   * deux onglets ouverts sur deux clients ne doivent pas se partager un panier.
   */
  protected readonly cart = new CartStore();

  protected readonly state = signal<LoadState>('loading');
  protected readonly company = signal<AdminCompanyDetail | null>(null);
  protected readonly history = signal<readonly AdminOrderRow[]>([]);
  protected readonly catalogue = signal<readonly CatalogItemView[]>([]);
  protected readonly habits = signal<readonly CustomerSkuStat[]>([]);
  protected readonly buyers = signal<readonly CompanyMemberView[]>([]);
  protected readonly pickups = signal<readonly PickupAddressView[]>([]);
  protected readonly zones = signal<readonly DeliveryZoneView[]>([]);
  protected readonly submitting = signal(false);

  /**
   * La source ouverte. Le **catalogue** par défaut : c'est la seule qui a
   * toujours quelque chose à montrer, y compris devant un compte qui n'a jamais
   * commandé.
   */
  protected readonly source = signal<SourceKind>('catalogue');
  protected readonly selectedOrderId = signal<string | null>(null);
  protected readonly selectedOrder = signal<OrderView | null>(null);

  /** Le carnet de livraison du compte — vide tant que la fiche n'en porte aucune. */
  protected readonly addresses = computed(() => this.company()?.addresses.deliveries ?? []);

  protected readonly companyName = computed(() => {
    const company = this.company();
    return company === null ? '' : companyDisplayName(company);
  });

  /**
   * La société règle-t-elle au compte ? Le miroir exact de la règle serveur —
   * active **et** au moins un terme accordé. L'écran s'en sert seulement pour ne
   * pas proposer un bouton qui échouerait ; c'est le serveur qui décide.
   */
  protected readonly settlesOnAccount = computed(() => {
    const company = this.company();
    return company !== null && company.status === 'active' && company.grantedTerms.length > 0;
  });

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(companyId: string): Promise<void> {
    this.state.set('loading');
    try {
      // Sept lectures indépendantes : les enchaîner aurait multiplié l'attente
      // par sept devant un commercial qui a le client en ligne.
      const [company, history, catalogue, habits, buyers, pickups, zones] = await Promise.all([
        this.companies.getById(companyId),
        this.orders.list({ companyId, limit: HISTORY_SIZE }),
        this.catalogService.list(),
        this.catalogService.habitsOf(companyId),
        this.companies.listMembers(companyId),
        this.pickupsService.list(),
        this.zonesService.list(),
      ]);
      if (company === undefined) {
        this.state.set('error');
        return;
      }
      this.company.set(company);
      this.history.set(history);
      this.catalogue.set(catalogue);
      this.habits.set(habits);
      this.buyers.set(buyers);
      this.pickups.set(pickups);
      this.zones.set(zones);
      this.state.set('ready');
    } catch {
      this.state.set('error');
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
      { sku: line.product.id, name: line.product.name, unitPriceCents: line.unitPriceCents },
      line.quantity,
    );
  }

  protected onAddAll(lines: readonly ProposedLine[]): void {
    for (const line of lines) {
      this.onAdd(line);
    }
  }

  protected async onPlace(draft: OrderDraft): Promise<void> {
    this.submitting.set(true);
    try {
      const placed = await this.orders.place({
        companyId: this.id(),
        buyerUserId: draft.buyerUserId,
        settlement: draft.settlement,
        fulfillmentMethod: draft.fulfillmentMethod,
        deliveryAddress: draft.deliveryAddress,
        pickupAddressId: draft.pickupAddressId,
        requestedDeliveryDate: draft.requestedDeliveryDate,
        note: draft.note,
        lines: [...this.cart.toPayloadLines()],
      });
      this.cart.clear();
      // Le carnet APRÈS la commande : une adresse enregistrée pour une commande
      // qui n'est pas passée serait une trace de rien.
      if (draft.saveAddressToBook && draft.deliveryAddress !== null) {
        await this.keepAddress(draft.deliveryAddress);
      }
      // Le lien de règlement est copié plutôt qu'affiché en passant : le
      // commercial a le client en ligne, et le canal e-mail n'a pas encore fait
      // ses preuves en production.
      if (placed.paymentUrl !== undefined) {
        await this.copy(placed.paymentUrl);
      }
      this.notify.success(`Commande ${placed.orderNumber} enregistrée.`);
      await this.router.navigate(['/commandes', placed.id]);
    } catch {
      this.notify.error(null, "La commande n'a pas pu être enregistrée.");
    } finally {
      this.submitting.set(false);
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
