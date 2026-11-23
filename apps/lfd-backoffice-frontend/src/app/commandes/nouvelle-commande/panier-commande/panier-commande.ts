import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldSelectComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  FoldTextareaComponent,
  type FoldTabItem,
} from 'fold-ng';
import {
  ITEM_LIMIT_OVERRIDE_REASON_MAX_LENGTH,
  ORDER_OFFER_NATURES,
  ORDER_OFFER_NOTE_MAX_LENGTH,
  STAFF_SETTLEMENT_LABELS,
  type AdminOrderEstimateView,
  type BudgetCommitmentRequirementsView,
  type CustomerAudience,
  type DeliveryAddressView,
  type DeliveryAvailabilityView,
  type DeliveryZoneView,
  type OrderOfferNature,
  type PickupAddressView,
  type StaffSettlement,
} from '@lfd/contracts';
import { NgTemplateOutlet } from '@angular/common';
import { CartRow } from '@lfd/b2b-ui/cart';
import { narrowViewport } from '../../../shared/viewport/narrow-viewport';
import { PermissionsStore } from '../../../auth/permissions.store';

import {
  budgetCommitmentGaps,
  commitmentStandingOf,
  proposedCommitmentNumber,
} from '../../budget-commitment';
import { BudgetCommitmentFields } from '../../budget-commitment-fields/budget-commitment-fields';
import type { CartStore } from '../cart.store';
import type { DraftStore } from '../draft.store';
import { buyerOf, composedDraftOf, type OrderDraft } from '../draft-payload';
import {
  estimatedLines,
  estimateRowsOf,
  estimateSummary,
  isBlockingRefusal,
} from '../order-estimate';
import type { OrderEntryBuyer } from '../order-entry-customer';
import {
  AcheminementCommande,
  type FulfillmentChoice,
} from '../acheminement-commande/acheminement-commande';
import { asksItemLimitReason, itemLimitBlockerOf, itemLimitNoticesOf } from '../item-limits';
import { MontantsPanier } from '../montants-panier/montants-panier';
import { panierBlockersOf, type PanierBlocker, type PanierView } from '../panier-blockers';

export type { OrderDraft } from '../draft-payload';
export type { PanierBlocker, PanierView } from '../panier-blockers';

/** L'acheminement tant que le sélecteur n'a rien émis — le temps d'un rendu. */
const NO_FULFILLMENT: FulfillmentChoice = {
  method: 'pickup',
  pickupAddressId: null,
  deliveryAddress: null,
  saveToBook: false,
  window: null,
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
 * **Aucun montant n'est calculé ici.** Tant que la saisie ne compose pas une
 * commande, la colonne montre le sous-total HT du devis ; dès qu'elle en compose
 * une, elle montre l'estimation du serveur (lot P2) — remises, frais, supplément,
 * TVA et TTC tels que la passation les écrirait. Les recopier ici donnerait deux
 * règles d'arrondi, donc un écart d'un centime devant le client.
 */
/** Le tiroir d'un téléphone : une colonne, donc la bascule. */
const SPLIT_MIN_MEDIA = '(max-width: 767px)';

@Component({
  selector: 'app-panier-commande',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    AcheminementCommande,
    BudgetCommitmentFields,
    CartRow,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldSelectComponent,
    MontantsPanier,
    FoldTabPanelComponent,
    FoldTabsComponent,
    FoldTextareaComponent,
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
  readonly buyers = input.required<readonly OrderEntryBuyer[]>();
  readonly pickups = input.required<readonly PickupAddressView[]>();
  readonly addresses = input.required<readonly DeliveryAddressView[]>();
  readonly zones = input.required<readonly DeliveryZoneView[]>();
  /** Le réglage de livraison et la clientèle de la société — relayés à l'acheminement. */
  readonly deliveryAvailability = input.required<DeliveryAvailabilityView>();
  readonly audience = input.required<CustomerAudience>();
  /** Le point préféré du client — relayé à l'acheminement (présélection). */
  readonly preferredPickupId = input<string | null>(null);
  /**
   * La société règle-t-elle au compte ? Faux ⇒ seul le lien est proposé. Le
   * serveur refuse de toute façon, mais un bouton qui échoue toujours est un
   * bouton qu'on n'aurait pas dû montrer.
   */
  readonly settlesOnAccount = input.required<boolean>();
  readonly submitting = input(false);
  /**
   * La case « enregistrer au carnet » est-elle proposée ? Vrai par défaut ;
   * faux au comptoir, qui n'a pas `b2b_companies:write`.
   */
  readonly canKeepAddress = input(true);
  /**
   * Porte-t-il son propre titre ? Faux dans le panneau mobile, dont l'en-tête
   * dit déjà « Panier » : deux titres l'un sous l'autre (Hugo, 2026-11-03).
   */
  readonly headed = input(true);
  /**
   * L'estimation du serveur (lot P2) — `null` tant que la saisie ne compose
   * pas une commande, ou que la réponse n'est pas revenue. Rien n'est calculé
   * ici : la colonne affiche ce que le serveur rend.
   */
  readonly estimate = input<AdminOrderEstimateView | null>(null);
  /**
   * L'estimation répond-elle à la saisie courante ? (plan total vu, T3) —
   * faux pendant qu'elle est en vol ou absente : la validation attend, parce
   * que c'est son total qui part comme total vu.
   */
  readonly estimateReady = input(false);
  /**
   * Le « Lien de règlement » est-il proposé ? Faux au comptoir (E4, Hugo,
   * 2026-11-03) : règlement au compte seulement.
   */
  readonly linkOffered = input(true);
  /**
   * Le payeur est un organisme public (plan clients publics, B5) : il règle au
   * compte, facture déposée sur Chorus Pro. Ni choix du règlement, ni lien.
   */
  readonly payerIsPublic = input(false);
  /** Ce que le payeur public exige de son engagement — `null` tant que non lu. */
  readonly commitmentRequirements = input<BudgetCommitmentRequirementsView | null>(null);
  /** La lecture des exigences a échoué : les champs restent, l'échec est dit. */
  readonly commitmentRequirementsFailed = input(false);

  /** L'engagement en cours de la société, jugé contre la journée choisie. */
  protected readonly commitmentStanding = computed(() =>
    commitmentStandingOf(
      this.commitmentRequirements()?.currentCommitment ?? null,
      this.draft().requestedDate(),
    ),
  );
  /** Le numéro saisi, sinon celui de l'engagement en cours. */
  protected readonly commitmentNumber = computed(() =>
    this.draft().commitmentNumberFor(proposedCommitmentNumber(this.commitmentStanding())),
  );

  /** Ce que l'écran ne calcule PAS, dit près du sous-total. */
  protected readonly TOTALS_LATER =
    'Prix du catalogue en attendant ceux de ce client : ils s’affichent, avec les remises, la livraison et le total, dès que le retrait ou la livraison est choisi.';

  protected readonly amounts = computed(() => this.estimate()?.amounts ?? null);

  /**
   * Le détail des montants, par la règle de toute commande (`orderTotalRows`) :
   * au compte le seul HT (F5), au lien TVA et TTC. `null` sans estimation.
   */
  protected readonly totalRows = computed(() =>
    estimateRowsOf(this.amounts(), {
      settlement: this.settlement(),
      method: this.fulfillment().method,
      pickupAddressId: this.fulfillment().pickupAddressId,
      pickups: this.pickups(),
    }),
  );

  /** « 7 articles · Total HT … » au compte, « … Total TTC … » au lien. */
  protected readonly summary = computed(() =>
    estimateSummary(this.cart().itemCount(), this.totalRows()),
  );

  /** La phrase « calculés à la validation » — sans objet dès que l'estimation est là. */
  protected readonly later = computed(() => (this.amounts() === null ? this.TOTALS_LATER : null));

  /** Les lignes au prix de l'estimation, prix barré compris, quand elle est là. */
  protected readonly shownLines = computed(() =>
    estimatedLines(this.cart().pricedLines(), this.amounts()),
  );

  /** Ce que la passation jugera sous verrou : dit, sans retenir la validation. */
  protected readonly warnings = computed(() => {
    const estimate = this.estimate();
    if (estimate === null) {
      return [];
    }
    const refusal = estimate.refusal;
    const soft = refusal !== null && !isBlockingRefusal(refusal) ? [refusal] : [];
    return [...soft, ...estimate.warnings].map((notice) => notice.message);
  });
  /** Le point du comptoir quand le « Retrait immédiat » est proposé — relayé à l'acheminement. */
  readonly counterPlaceId = input<string | null>(null);
  /**
   * Ce que la vitrine ne couvre pas, ou pourquoi son stock est illisible —
   * `null` quand tout tient. Ne compte qu'au retrait immédiat.
   */
  readonly shelfIssue = input<string | null>(null);

  readonly place = output<OrderDraft>();

  /** Le mot de chaque ligne fermée par la limite de son produit, par SKU. */
  protected readonly limitNotices = computed(() =>
    itemLimitNoticesOf(this.estimate()?.cutoff ?? null),
  );
  /** La saisie passe une limite de produit : le champ du motif a lieu d'être. */
  protected readonly asksReason = computed(() =>
    asksItemLimitReason(this.estimate()?.cutoff ?? null),
  );
  protected readonly reasonMax = ITEM_LIMIT_OVERRIDE_REASON_MAX_LENGTH;
  protected readonly reasonHint = computed(
    () =>
      `Obligatoire, consigné sur la commande. ${String(this.draft().itemLimitReason().trim().length)} / ${String(this.reasonMax)} caractères.`,
  );

  constructor() {
    // Un refus « motif manquant » ramène au champ, qui vit dans la vue des lignes.
    effect(() => {
      const draft = this.draft();
      if (draft.itemLimitReasonAsked()) {
        untracked(() => {
          this.view.set('lines');
          draft.itemLimitReasonAsked.set(false);
        });
      }
    });
  }

  /**
   * L'acheminement résolu par le sélecteur. Le seul état que la colonne garde
   * pour elle : c'est une **dérivation** du brouillon et des points/zones connus,
   * pas une décision de plus.
   */
  protected readonly fulfillment = computed<FulfillmentChoice>(
    () => this.draft().fulfillment() ?? NO_FULFILLMENT,
  );
  /** La validation demande une confirmation explicite — cf. `blockers`. */
  protected readonly confirming = signal(false);

  protected readonly requestedDate = computed(() => this.draft().requestedDate());
  protected readonly note = computed(() => this.draft().note());
  protected readonly settlement = computed(() => this.draft().settlement());

  private readonly permissions = inject(PermissionsStore);
  /**
   * Offrir est un droit à part (`b2b_offer_order:write`) : saisir une commande
   * ne suffit pas. Sans lui, le choix « Offerte » n'est pas montré — le serveur
   * le refuserait de toute façon.
   */
  protected readonly canOffer = computed(() => this.permissions.can('b2b_offer_order:write'));

  protected readonly labels = STAFF_SETTLEMENT_LABELS;
  /**
   * L'ordre des modes à l'écran : le compte d'abord, quand il est ouvert, parce
   * que c'est le régime négocié. Une liste typée et non deux littéraux dans le
   * gabarit — le compilateur vérifie alors l'indexation des libellés.
   */
  protected readonly settlementModes = computed<readonly StaffSettlement[]>(() => [
    'account',
    ...(this.linkOffered() ? (['link'] as const) : []),
    ...(this.canOffer() ? (['offered'] as const) : []),
  ]);

  /** Les natures d'une commande offerte, dans l'ordre du registre. */
  protected readonly offerNatureOptions = ORDER_OFFER_NATURES.map((nature) => ({
    value: nature.key,
    label: nature.label,
  }));
  protected readonly offerNoteMax = ORDER_OFFER_NOTE_MAX_LENGTH;
  protected readonly offerNoteHint = computed(
    () =>
      `Obligatoire, gardé avec la commande. ${String(this.draft().offerNote().trim().length)} / ${String(this.offerNoteMax)} caractères.`,
  );

  /** Le choix par défaut : le détenteur, sinon le premier membre venu. */
  protected readonly buyer = computed<string | null>(() =>
    buyerOf(this.draft().buyerUserId(), this.buyers()),
  );

  /** Le raccourci du comptoir est-il choisi ? */
  protected readonly immediate = computed(
    () => this.counterPlaceId() !== null && this.draft().entry() === 'immediate',
  );

  /** Retrait ou livraison : la date demandée ne désigne pas la même chose. */
  protected readonly dateLabel = computed(() =>
    this.fulfillment().method === 'delivery' ? 'Livraison souhaitée le' : 'Retrait souhaité le',
  );

  /**
   * Ce qui empêche de valider, dit en clair. Une liste et non un booléen : un
   * bouton grisé sans raison oblige à deviner ce qui manque.
   */
  protected readonly blockers = computed<readonly PanierBlocker[]>(() => {
    const limit = itemLimitBlockerOf(
      this.estimate()?.cutoff ?? null,
      this.draft().itemLimitOverriding(),
      this.draft().itemLimitReason(),
    );
    const issues = panierBlockersOf({
      empty: this.cart().isEmpty(),
      hasBuyer: this.buyer() !== null,
      requestedDate: this.draft().requestedDate(),
      fulfillmentIssue: this.fulfillment().issue,
      shelfIssue: this.immediate() ? this.shelfIssue() : null,
      settlement: this.settlement(),
      linkOffered: this.linkOffered(),
      settlesOnAccount: this.settlesOnAccount(),
      canOffer: this.canOffer(),
      offerNature: this.draft().offerNature(),
      offerNote: this.draft().offerNote(),
      payerIsPublic: this.payerIsPublic(),
      commitmentGaps: budgetCommitmentGaps(
        this.commitmentRequirements(),
        this.commitmentNumber(),
        this.draft().commitmentServiceCode(),
      ),
      refusal: this.estimate()?.refusal ?? null,
    });
    return limit === null ? issues : [...issues, { text: limit, view: 'lines' }];
  });

  protected readonly canPlace = computed(
    () => this.blockers().length === 0 && !this.submitting() && this.estimateReady(),
  );

  /**
   * Les deux vues du panier (Hugo, 2026-11-03). Pas de bascule automatique au
   * premier ajout : l'ajout se fait depuis la colonne de gauche, et l'en-tête
   * dit déjà le compte et le sous-total — retirer les réglages de sous les yeux
   * du commercial serait la surprise.
   */
  protected readonly viewTabs: FoldTabItem<PanierView>[] = [
    { key: 'settings', label: 'Paramétrer la commande', icon: 'sliders' },
    { key: 'lines', label: 'Voir le panier', icon: 'list' },
  ];
  readonly view = signal<PanierView>('settings');

  /** Sous cette largeur, le tiroir est trop étroit pour deux colonnes. */
  private readonly handheld = narrowViewport(SPLIT_MIN_MEDIA);

  /**
   * Réglages et lignes côte à côte, sans bascule : dans le tiroir (sans
   * en-tête) d'un écran de tablette, qui a la largeur de deux colonnes
   * (Hugo, 2026-11-21). La colonne du large et le téléphone gardent la bascule.
   */
  protected readonly split = computed(() => !this.headed() && !this.handheld());

  /** Une date tapée est un choix : elle cesse d'être une proposition. */
  protected onDate(value: string): void {
    this.draft().requestedDate.set(value);
    this.draft().dateProposed.set(false);
  }

  protected onFulfillment(choice: FulfillmentChoice): void {
    this.draft().fulfillment.set(choice);
    // Changer d'acheminement change ce qu'on s'apprêtait à confirmer.
    this.confirming.set(false);
  }

  protected onSettlement(value: StaffSettlement): void {
    this.draft().settlement.set(value);
    // Changer de mode de règlement rouvre la confirmation : c'est précisément la
    // décision qu'on demandait de confirmer.
    this.confirming.set(false);
  }

  protected onOfferNature(value: OrderOfferNature | null): void {
    this.draft().offerNature.set(value);
  }

  protected submit(): void {
    const draft = composedDraftOf({
      buyerUserId: this.buyer(),
      fulfillment: this.draft().fulfillment(),
      requestedDate: this.requestedDate(),
      note: this.note(),
      settlement: this.settlement(),
      offerNature: this.draft().offerNature(),
      offerNote: this.draft().offerNote(),
      immediate: this.immediate(),
      empty: this.cart().isEmpty(),
    });
    if (draft === null || !this.canPlace()) {
      return;
    }
    this.place.emit(draft);
  }

  /** Le nom d'une personne, ou son adresse quand elle n'en a pas encore. */
  protected nameOf(member: OrderEntryBuyer): string {
    const name = `${member.firstName} ${member.lastName}`.trim();
    return name === '' ? member.email : name;
  }
}
