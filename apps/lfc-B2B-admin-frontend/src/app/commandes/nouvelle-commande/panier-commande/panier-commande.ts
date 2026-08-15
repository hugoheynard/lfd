import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent, FoldSelectComponent } from 'fold-ng';
import {
  STAFF_SETTLEMENT_LABELS,
  type BillingAddressPayload,
  type CompanyMemberView,
  type DeliveryAddressView,
  type DeliveryZoneView,
  type FulfillmentMethod,
  type PickupAddressView,
  type StaffSettlement,
} from '@lfd/contracts';
import { CartRow } from '@lfd/b2b-ui/cart';
import { formatCents } from '@lfd/b2b-ui/order';

import type { CartStore } from '../cart.store';
import type { DraftStore } from '../draft.store';
import {
  AcheminementCommande,
  type FulfillmentChoice,
} from '../acheminement-commande/acheminement-commande';

/** Ce que la colonne rend au moment de valider — les lignes viennent de la page. */
export interface OrderDraft {
  readonly buyerUserId: string;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly pickupAddressId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  /** L'adresse dictée rejoint-elle le carnet du compte ? */
  readonly saveAddressToBook: boolean;
  readonly requestedDeliveryDate: string | null;
  readonly note: string;
  readonly settlement: StaffSettlement;
}

/** L'acheminement tant que le sélecteur n'a rien émis — le temps d'un rendu. */
const NO_FULFILLMENT: FulfillmentChoice = {
  method: 'pickup',
  pickupAddressId: null,
  deliveryAddress: null,
  saveToBook: false,
  issue: 'Acheminement non déterminé.',
};

/**
 * La colonne de droite : **le panier et ce qui l'accompagne**.
 *
 * Elle porte les quatre décisions qui ne sont pas des articles — pour qui,
 * comment et quand acheminer, et comment ça se règle — puis rend un brouillon
 * complet. La page y ajoute les lignes : le panier sait ce qu'il contient, la
 * colonne sait ce qu'on en fait.
 *
 * **La commande appartient au compte, pas à une personne.** L'interlocuteur choisi
 * ici est celui à qui elle est portée — celui qu'on rappelle si une caisse manque,
 * et le seul à qui un lien de règlement puisse être adressé. Il ne la verra pas
 * pour autant dans son « Mes commandes », qui ne liste que les commandes
 * personnelles ; l'écran l'annonçait, et faisait promettre au commercial un écran
 * qui n'affiche rien.
 *
 * **Le seul montant affiché est le sous-total HT.** Remise de retrait, frais de
 * zone, TVA par taux et total TTC sont calculés par le serveur à la validation —
 * les recopier ici donnerait deux implémentations de la même règle d'arrondi,
 * donc deux résultats à un centime près, et un client qui compare son écran à sa
 * facture.
 */
@Component({
  selector: 'app-panier-commande',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AcheminementCommande,
    CartRow,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldSelectComponent,
  ],
  templateUrl: './panier-commande.html',
  styleUrl: './panier-commande.scss',
})
export class PanierCommande {
  readonly cart = input.required<CartStore>();
  /** Le brouillon : les décisions qui ne sont pas des articles. */
  readonly draft = input.required<DraftStore>();
  /** Le nom du compte — la commande est la sienne, et la colonne le redit. */
  readonly companyName = input.required<string>();
  /** Les personnes du compte à qui la commande peut être portée. */
  readonly buyers = input.required<readonly CompanyMemberView[]>();
  readonly pickups = input.required<readonly PickupAddressView[]>();
  readonly addresses = input.required<readonly DeliveryAddressView[]>();
  readonly zones = input.required<readonly DeliveryZoneView[]>();
  /**
   * La société règle-t-elle au compte ? Faux ⇒ seul le lien est proposé. Le
   * serveur refuse de toute façon, mais un bouton qui échoue toujours est un
   * bouton qu'on n'aurait pas dû montrer.
   */
  readonly settlesOnAccount = input.required<boolean>();
  readonly submitting = input(false);

  readonly place = output<OrderDraft>();

  /**
   * L'acheminement résolu par le sélecteur. Le seul état que la colonne garde
   * pour elle : c'est une **dérivation** du brouillon et des points/zones connus,
   * pas une décision de plus.
   */
  protected readonly fulfillment = signal<FulfillmentChoice>(NO_FULFILLMENT);
  /** La validation demande une confirmation explicite — cf. `blockers`. */
  protected readonly confirming = signal(false);

  protected readonly requestedDate = computed(() => this.draft().requestedDate());
  protected readonly note = computed(() => this.draft().note());
  protected readonly settlement = computed(() => this.draft().settlement());

  protected readonly labels = STAFF_SETTLEMENT_LABELS;
  /**
   * L'ordre des modes à l'écran : le compte d'abord, quand il est ouvert, parce
   * que c'est le régime négocié. Une liste typée et non deux littéraux dans le
   * gabarit — le compilateur vérifie alors l'indexation des libellés.
   */
  protected readonly settlementModes: readonly StaffSettlement[] = ['account', 'link'];

  /** Le choix par défaut : le détenteur, sinon le premier membre venu. */
  protected readonly buyer = computed<string | null>(() => {
    const chosen = this.draft().buyerUserId();
    if (chosen !== null) {
      return chosen;
    }
    const members = this.buyers();
    return (members.find((m) => m.role === 'owner') ?? members[0])?.userId ?? null;
  });

  /** Retrait ou livraison : la date demandée ne désigne pas la même chose. */
  protected readonly dateLabel = computed(() =>
    this.fulfillment().method === 'delivery' ? 'Livraison souhaitée le' : 'Retrait souhaité le',
  );

  /**
   * Ce qui empêche de valider, dit en clair. Une liste et non un booléen : un
   * bouton grisé sans raison oblige à deviner ce qui manque.
   */
  protected readonly blockers = computed<readonly string[]>(() => {
    const issues: string[] = [];
    if (this.cart().isEmpty()) {
      issues.push('Le panier est vide.');
    }
    if (this.buyer() === null) {
      issues.push(
        "Ce compte n'a aucun interlocuteur avec un accès : la commande n'a personne à qui être portée.",
      );
    }
    const acheminement = this.fulfillment().issue;
    if (acheminement !== null) {
      issues.push(acheminement);
    }
    if (this.settlement() === 'account' && !this.settlesOnAccount()) {
      issues.push('Cette société ne règle pas au compte — aucun crédit ne lui a été accordé.');
    }
    return issues;
  });

  protected readonly canPlace = computed(() => this.blockers().length === 0 && !this.submitting());

  /** Le sous-total HT du panier. Cf. l'avertissement de la classe. */
  protected readonly subtotal = computed(() => formatCents(this.cart().subtotalCents()));

  protected onFulfillment(choice: FulfillmentChoice): void {
    this.fulfillment.set(choice);
    // Changer d'acheminement change ce qu'on s'apprêtait à confirmer.
    this.confirming.set(false);
  }

  protected onSettlement(value: string): void {
    this.draft().settlement.set(value === 'account' ? 'account' : 'link');
    // Changer de mode de règlement rouvre la confirmation : c'est précisément la
    // décision qu'on demandait de confirmer.
    this.confirming.set(false);
  }

  protected submit(): void {
    const buyerUserId = this.buyer();
    if (buyerUserId === null || !this.canPlace()) {
      return;
    }
    const acheminement = this.fulfillment();
    this.place.emit({
      buyerUserId,
      fulfillmentMethod: acheminement.method,
      pickupAddressId: acheminement.pickupAddressId,
      deliveryAddress: acheminement.deliveryAddress,
      saveAddressToBook: acheminement.saveToBook,
      requestedDeliveryDate: this.requestedDate() === '' ? null : this.requestedDate(),
      note: this.note(),
      settlement: this.settlement(),
    });
  }

  /** Le nom d'une personne, ou son adresse quand elle n'en a pas encore. */
  protected nameOf(member: CompanyMemberView): string {
    const name = `${member.firstName} ${member.lastName}`.trim();
    return name === '' ? member.email : name;
  }
}
