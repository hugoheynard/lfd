import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent, FoldSelectComponent } from 'fold-ng';
import {
  STAFF_SETTLEMENT_LABELS,
  type CompanyMemberView,
  type PickupAddressView,
  type StaffSettlement,
} from '@lfd/contracts';
import { formatCents } from '@lfd/b2b-ui/order';

import type { CartStore } from '../cart.store';

/** Ce que la colonne rend au moment de valider — les lignes viennent de la page. */
export interface OrderDraft {
  readonly buyerUserId: string;
  readonly pickupAddressId: string | null;
  readonly requestedDeliveryDate: string | null;
  readonly note: string;
  readonly settlement: StaffSettlement;
}

/**
 * La colonne de droite : **le panier et ce qui l'accompagne**.
 *
 * Elle porte les quatre décisions qui ne sont pas des articles — au nom de qui,
 * où et quand retirer, et comment ça se règle — puis rend un brouillon complet.
 * La page y ajoute les lignes : le panier sait ce qu'il contient, la colonne sait
 * ce qu'on en fait.
 *
 * **Retrait uniquement**, et ce n'est pas un raccourci : `DELIVERY_SERVICE_OPEN`
 * est à faux, LFC ne livre pas encore. Proposer un coursier ici ferait promettre
 * au téléphone un service qui n'existe pas.
 *
 * **Le seul montant affiché est le sous-total HT.** Remise de retrait, TVA par
 * taux et total TTC sont calculés par le serveur à la validation — les recopier
 * ici donnerait deux implémentations de la même règle d'arrondi, donc deux
 * résultats à un centime près, et un client qui compare son écran à sa facture.
 */
@Component({
  selector: 'app-panier-commande',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldSelectComponent],
  templateUrl: './panier-commande.html',
  styleUrl: './panier-commande.scss',
})
export class PanierCommande {
  readonly cart = input.required<CartStore>();
  /** Les personnes du compte au nom de qui on peut porter la commande. */
  readonly buyers = input.required<readonly CompanyMemberView[]>();
  readonly pickups = input.required<readonly PickupAddressView[]>();
  /**
   * La société règle-t-elle au compte ? Faux ⇒ seul le lien est proposé. Le
   * serveur refuse de toute façon, mais un bouton qui échoue toujours est un
   * bouton qu'on n'aurait pas dû montrer.
   */
  readonly settlesOnAccount = input.required<boolean>();
  readonly submitting = input(false);

  readonly place = output<OrderDraft>();

  protected readonly buyerUserId = signal<string | null>(null);
  protected readonly pickupAddressId = signal<string | null>(null);
  protected readonly requestedDate = signal('');
  protected readonly note = signal('');
  protected readonly settlement = signal<StaffSettlement>('link');
  /** La validation demande une confirmation explicite — cf. `blockers`. */
  protected readonly confirming = signal(false);

  protected readonly labels = STAFF_SETTLEMENT_LABELS;
  /**
   * L'ordre des modes à l'écran : le compte d'abord, quand il est ouvert, parce
   * que c'est le régime négocié. Une liste typée et non deux littéraux dans le
   * gabarit — le compilateur vérifie alors l'indexation des libellés.
   */
  protected readonly settlementModes: readonly StaffSettlement[] = ['account', 'link'];

  /** Le choix par défaut : le détenteur, sinon le premier membre venu. */
  protected readonly buyer = computed<string | null>(() => {
    const chosen = this.buyerUserId();
    if (chosen !== null) {
      return chosen;
    }
    const members = this.buyers();
    return (members.find((m) => m.role === 'owner') ?? members[0])?.userId ?? null;
  });

  protected readonly point = computed<string | null>(
    () => this.pickupAddressId() ?? this.pickups().find((p) => p.isDefault)?.id ?? null,
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
    if (this.settlement() === 'account' && !this.settlesOnAccount()) {
      issues.push('Cette société ne règle pas au compte — aucun crédit ne lui a été accordé.');
    }
    return issues;
  });

  protected readonly canPlace = computed(() => this.blockers().length === 0 && !this.submitting());

  /** Le sous-total HT du panier. Cf. l'avertissement de la classe. */
  protected readonly subtotal = computed(() => formatCents(this.cart().subtotalCents()));

  protected linePrice(unitPriceCents: number, quantity: number): string {
    return formatCents(unitPriceCents * quantity);
  }

  protected onQuantity(sku: string, value: string): void {
    const quantity = Number.parseInt(value, 10);
    this.cart().setQuantity(sku, Number.isNaN(quantity) ? 0 : quantity);
  }

  protected onSettlement(value: string): void {
    this.settlement.set(value === 'account' ? 'account' : 'link');
    // Changer de mode de règlement rouvre la confirmation : c'est précisément la
    // décision qu'on demandait de confirmer.
    this.confirming.set(false);
  }

  protected submit(): void {
    const buyerUserId = this.buyer();
    if (buyerUserId === null || !this.canPlace()) {
      return;
    }
    this.place.emit({
      buyerUserId,
      pickupAddressId: this.point(),
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
