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
import { instantToLocal } from '@lfd/contracts';
import {
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { SignInChoices } from '../../../login/sign-in-choices/sign-in-choices';
import { GuestIdentityForm, type GuestIdentity } from '../guest-identity-form/guest-identity-form';

import type { OrderSettlement } from '@lfd/contracts';

import { AuthFacade } from '../../../auth/auth.facade';
import { settlesOnAccount } from '../../../account/settles-on-account';
import { ClientCompany } from '../../client-company.service';
import { formatCents } from '../../format-money';
import { ClientCart } from '../client-cart.service';
import { ClientLocale } from '../../client-locale.service';
import { serviceDayLabel } from '../../format-day';
import { OrderContextStore } from '../../order-context.store';
import { ClientOrders } from '../../client-orders.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { dialogSide } from '../../panel-side';
import { CartSummary } from '../cart-summary/cart-summary';
import { OrderDoors } from '../../shop/order-doors';
import { OrderAdmissionStore } from '../../shop/order-admission.store';
import { OrderOpeningStore } from '../../shop/order-opening.store';
import { PieceRequest } from '../../shop/piece-request.service';
import { ServiceDayNotice } from '../../shop/service-day-notice';

/**
 * Où Auth0 ramène, une fois l'identité obtenue : **le rayon**.
 *
 * 🔴 C'était le panier, tant qu'il avait une adresse. Il n'en a plus : un
 * dialogue ne se restaure pas au retour d'une redirection. Le panier, lui,
 * survit — il vit dans le stockage local — et se rouvre d'un geste depuis la
 * barre, où sa pastille porte déjà son compte.
 */
const AFTER_SIGN_IN = '/boutique';

/**
 * **Le panier, en dialogue** (Hugo, 2026-09-21 : « le panier devient un dialog
 * comme le reste »).
 *
 * 🔴 Il était un ÉCRAN, et c'est ce qui coûtait : on quittait le rayon pour
 * relire ce qu'on venait d'y mettre, puis il fallait y revenir. Trois surfaces
 * disaient la même chose — la page, le popover de la barre au bureau, et le
 * lien de la pastille en pile. Il n'en reste qu'une, et elle s'ouvre par-dessus
 * ce qu'on était en train de faire.
 *
 * Il ne redemande rien : le lieu et le créneau sont déjà pris, ils se rappellent
 * en tête — et « Modifier » les rouvre sans fermer le panier. Le seul geste qui
 * reste est de régler, et le bouton porte le montant plutôt que de le laisser
 * deviner.
 *
 * ⚠️ **Ce qui sort d'ici NAVIGUE, et referme donc le dialogue** : le règlement
 * et la confirmation sont des écrans, parce qu'une commande existe déjà quand
 * on y arrive et que leur adresse doit survivre à un rechargement.
 */
@Component({
  selector: 'app-cart-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CartSummary,
    FoldCalloutComponent,
    GuestIdentityForm,
    SignInChoices,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './cart-dialog.html',
  styleUrl: './cart-dialog.scss',
})
export class CartDialog {
  static readonly foldPanel: FoldPanelDefaults = {
    side: 'center',
    // `lg` : des lignes de produit avec quantité, prix unitaire et total
    // doivent tenir sans se replier — c'est la contrainte la plus forte de ce
    // dialogue, et la seule qui décide de sa largeur.
    width: 'lg',
    surface: 'solid',
  };

  /**
   * Ouvre le panier. Il ne rend rien : ce qu'on y décide part par le routeur.
   *
   * ⚠️ **Non modal en pile** (Hugo, 2026-10-09) : le voile de la feuille du bas
   * bloquait la barre de l'app, donc la pastille qui devait la refermer. Au
   * bureau, le dialogue centré reste modal — voile, piège de focus, Échap.
   */
  static open(panels: FoldPanelHostService): FoldPanelRef<void> {
    const side = dialogSide();
    return panels.open<undefined, void>(CartDialog, {
      side,
      modal: side !== 'bottom',
      stack: true,
      data: undefined,
    });
  }

  /**
   * ⚠️ Déclarée sans jamais être lue, et c'est le CONTRAT DE FOLD qui l'exige :
   * `FoldPanelContent` n'a que des membres facultatifs, et TypeScript refuse un
   * type « faible » auquel une classe n'apporte aucune propriété commune. Ce
   * panneau n'a rien à recevoir — le panier vit dans son magasin, et c'est tout
   * l'intérêt : on l'ouvre d'où l'on veut sans rien lui passer.
   */
  readonly data = input<undefined>();

  private readonly ref = inject(FoldPanelRef);

  private readonly router = inject(Router);
  private readonly order = inject(OrderContextStore);
  private readonly orders = inject(ClientOrders);
  /** L'hôte des panneaux fold : c'est lui qui ouvre la saisie du visiteur. */

  /** Les portes du mode de service — les mêmes que l'accueil ouvre. */
  private readonly doors = inject(OrderDoors);

  /** « Trop tard pour demain : … » — le même avertissement que la barre du rayon. */
  protected readonly lateNotice = inject(ServiceDayNotice).message;

  private readonly firm = inject(ClientCompany);

  /**
   * La boutique fermée à la clientèle de la personne (« Ouverture de la
   * boutique », 2026-10-09) : le pied dit « Les commandes sont fermées » à la
   * place du bouton. Le serveur refuse de toute façon en 409.
   */
  private readonly opening = inject(OrderOpeningStore);
  // Fermée, sauf pour qui une exemption couvre (2026-10-26) : le serveur le
  // dit pour CETTE personne, sans rien révéler des autres.
  private readonly admission = inject(OrderAdmissionStore);
  protected readonly ordersClosed = computed(
    () => !this.opening.ordersOpen() && !this.admission.admitted(),
  );

  constructor() {
    void this.opening.hydrate();
    // La suggestion du panier ouvre la fiche de son article (Hugo,
    // 2026-10-18) : le panier s'efface pour qu'elle se voie.
    const pieces = inject(PieceRequest);
    const openedAfter = pieces.rank();
    effect(() => {
      const ask = pieces.latest();
      if (ask !== null && ask.id > openedAfter) {
        this.ref.close();
      }
    });
  }

  /**
   * **Le compte est-il une option ?** — seulement si le mensuel a été ACCORDÉ.
   *
   * 🔴 `grantedTerms`, et non le terme SOUHAITÉ : le contrat distingue les deux
   * (`company.ts`), et confondre une demande avec un droit acquis proposerait
   * un règlement que le serveur refuse par `TermsNotGrantedError`. Un
   * particulier n'a pas de société, donc jamais. Un prélèvement suspendu par
   * la comptabilité ferme aussi l'option (`settlesOnAccount`).
   */
  protected readonly mayUseAccount = computed(() => settlesOnAccount(this.firm.company()));

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);
  protected readonly choice = this.order.choice;
  private readonly locale = inject(ClientLocale);
  private readonly auth = inject(AuthFacade);

  /**
   * **Ce qui manque pour régler : savoir qui commande.**
   *
   * 🔴 `isLoading()` passe AVANT `isAuthenticated()`, et ce n'est pas un détail
   * de prudence. Le SDK Auth0 résout la session au premier chargement, et
   * `isAuthenticated` vaut `false` pendant ce temps-là **pour un client bel et
   * bien connecté** : sans cette garde, l'invite « Qui passe cette commande ? »
   * clignoterait devant un abonné, à l'écran le plus sensible du tunnel.
   *
   * C'est la même précaution que prenait `featureAccessGuard` (retirée le
   * 2026-10-09 avec la clé `shop`), pour la même raison.
   */
  private readonly unknownCustomer = computed(
    () => !this.auth.isLoading() && !this.auth.isAuthenticated(),
  );

  /**
   * Le règlement est-il retenu faute de savoir qui commande ?
   *
   * La question ne se pose que devant une commande réglable : un panier vide
   * rouvre le rayon, un panier sans mode de service mène à la question du lieu.
   * Réclamer une identité avant ces deux-là demanderait qui vous êtes à
   * quelqu'un qui n'a encore rien à acheter.
   */
  protected readonly identityNeeded = computed(
    () => this.unknownCustomer() && !this.cart.isEmpty() && this.choice() !== null,
  );

  /** L'identité que le visiteur a saisie dans la carte, complète, ou `null`. */
  protected readonly guest = signal<GuestIdentity | null>(null);

  /**
   * Le mode est choisi, mais pas le créneau — un choix relu du navigateur,
   * posé avant le 2026-10-14. Pas de commande sans créneau (Hugo) : on ne le
   * présélectionne pas, on dit le geste (« Modifier »).
   */
  protected readonly slotMissing = computed(() => {
    const service = this.choice();
    return !this.cart.isEmpty() && service !== null && service.window === null;
  });

  /**
   * Le règlement attend qu'on sache qui commande — un compte, ou une saisie
   * complète — et que le créneau soit choisi.
   */
  protected readonly payBlocked = computed(
    () =>
      this.slotMissing() ||
      (this.identityNeeded() && this.guest() === null) ||
      // Rien à choisir (2026-10-16) : le bouton ne mène pas à une question vide.
      (this.choice() === null && !this.cart.isEmpty() && !this.serviceOffered()),
  );

  /**
   * « demain · créneau choisi », avec la VRAIE journée : celle que le serveur a
   * accordée au point, et non « demain » écrit en dur.
   *
   * Aujourd'hui se lit à l'horloge du navigateur, à Paris : c'est un libellé, et
   * seul un onglet laissé ouvert passé minuit pourrait le décaler d'un mot.
   */
  protected readonly slotNote = computed(() => {
    const service = this.choice();
    if (service === null) {
      return '';
    }
    const c = this.t().cart;
    const day = serviceDayLabel(
      service.date,
      instantToLocal(new Date()).day,
      this.locale.current(),
      {
        today: c.dayToday,
        tomorrow: c.dayTomorrow,
      },
    );
    return fill(c.slotNote, { day });
  });

  /**
   * Le bouton nomme la SUITE, et elle dépend de ce qui manque : un panier vide
   * se ferme (il disait « Voir le rayon », et ne faisait que fermer — ouvert
   * depuis « Mes commandes », il y laissait ; Hugo, 2026-10-09), un panier sans mode de service renvoie à la question, et
   * un panier prêt porte le montant.
   */
  protected readonly ctaLabel = computed(() => {
    if (this.cart.isEmpty()) {
      return this.t().cart.closeEmpty;
    }
    if (this.choice() === null) {
      return this.t().shop.pickService;
    }
    return fill(this.t().cart.pay, { total: formatCents(this.cart.totals().totalCents) });
  });

  /** Faux quand ni retrait ni coursier ne sont proposés à qui regarde (2026-10-16). */
  protected readonly serviceOffered = computed(() => this.doors.serviceOffered());

  /**
   * **Le mode de service se choisit ICI, en dialogues** (2026-09-21).
   *
   * 🔴 Les deux gestes menaient à `/nouvelle-commande`, et le second devait
   * emporter un `RETURN_TO_CART` pour revenir : sans lui, l'écran de commande
   * enchaînait sur le rayon, et on avait changé d'heure pour se retrouver à
   * recomposer un panier qui était déjà fait. Ce paramètre de retour était la
   * preuve que le détour n'avait pas lieu d'être — on ne fabrique pas un
   * chemin de retour vers l'endroit qu'on n'aurait pas dû quitter.
   *
   * ⚠️ Retrait OU coursier depuis le 2026-10-13 (O6) : `OrderDoors.choose`
   * ne pose la question que si le coursier est ouvert à la clientèle, sinon
   * il va droit au retrait.
   */
  protected async pickService(): Promise<void> {
    await this.doors.choose();
  }

  /** Rouvre le choix déjà fait, sans quitter le panier. */
  protected async changeService(): Promise<void> {
    const service = this.choice();
    if (service === null) {
      await this.doors.choose();
      return;
    }
    if (service.mode === 'delivery') {
      // L'adresse et le jour retenus se reproposent : rouvrir pour changer
      // l'un ne doit pas faire perdre l'autre (2026-10-13).
      await this.doors.delivery(service.deliveryAddressId ?? null, service.date);
      return;
    }
    // Changer de maison périme l'heure : on rouvre les deux, dans l'ordre.
    await this.doors.pickup(service.pickupAddressId);
  }

  /**
   * « Me connecter » REMPLACE la saisie d'invité par les méthodes de
   * connexion, dans la même carte (Hugo, 2026-10-11) ; « Commander en tant
   * qu'invité » la rend. On ne garde pas une identité à moitié tapée derrière
   * un choix qu'on vient de défaire.
   */
  protected readonly signingIn = signal(false);

  protected showSignIn(): void {
    if (this.signingIn()) {
      return;
    }
    this.identify(null);
    this.signingIn.set(true);
  }

  /** La saisie de l'invité ; son adresse, complète, sert aussi à demander l'exemption. */
  protected identify(identity: GuestIdentity | null): void {
    this.guest.set(identity);
    this.admission.guestTyped(identity?.email ?? null);
  }

  protected showGuest(): void {
    this.signingIn.set(false);
  }

  /** Où revenir une fois connecté : ICI, panier compris. */
  protected readonly afterSignIn = AFTER_SIGN_IN;

  /** Rouvrir le rayon, c'est simplement refermer le panier : on y était. */
  protected backToShop(): void {
    this.ref.close();
  }

  /**
   * Passe la commande, puis mène là où elle en est.
   *
   * 🔴 **Le résultat de `place()` n'était pas attendu.** La méthode est
   * asynchrone depuis qu'elle écrit au serveur ; `place() !== null` comparait
   * une *promesse* à `null`, donc toujours vrai. Un refus du serveur — heure
   * limite dépassée, zone non desservie, SKU disparu — menait quand même à
   * l'écran « c'est réglé », pour une commande qui n'existait pas.
   *
   * La suite dépend de ce que le serveur a décidé du règlement : une carte à
   * présenter mène au règlement, tout le reste à la confirmation.
   */
  /**
   * **Ajouter au compte** — le vrai différé, et il se décide ICI.
   *
   * ⚠️ Il ne passe jamais par l'écran de règlement : le serveur rend alors
   * `settlement: 'later'`, et la commande file à la confirmation. C'est ce que
   * « Régler plus tard » laissait croire là-bas, sans que ce soit vrai.
   */
  protected proceedOnAccount(): Promise<void> {
    return this.proceed('account');
  }

  /** Payer comptant : toujours possible, y compris au mensuel. */
  protected proceedByCard(): Promise<void> {
    return this.proceed('card');
  }

  protected async proceed(settlement: OrderSettlement | null = null): Promise<void> {
    if (this.cart.isEmpty()) {
      this.backToShop();
      return;
    }
    // Régler exige le mode : c'est lui qui porte la remise et les frais. On
    // POSE la question plutôt que de facturer un panier sans destination — et
    // si elle reste sans réponse, on ne va nulle part.
    if (this.choice() === null) {
      await this.pickService();
      if (this.choice() === null) {
        return;
      }
    }
    // Pas de commande sans créneau (2026-10-14) : le bouton est grisé, et la
    // garde tient aussi si on l'appelle autrement.
    if (this.slotMissing()) {
      return;
    }
    // Un visiteur commande avec ce qu'il a saisi dans la carte : `POST
    // /shop/orders` rend l'intention Stripe AVEC la commande, et la suite est
    // celle d'un client connecté.
    const buyer = this.guest();
    if (this.identityNeeded() && buyer === null) {
      return;
    }
    const placed =
      this.identityNeeded() && buyer !== null
        ? await this.orders.placeAsGuest(buyer)
        : await this.orders.place(settlement);
    if (placed === null) {
      // Le refus a déjà été dit, et le panier est intact : on ne bouge pas de
      // l'écran où la correction est possible.
      return;
    }
    this.leaveFor(placed);
  }

  /**
   * La suite dépend de ce que le SERVEUR a décidé du règlement : une carte à
   * présenter mène au règlement, tout le reste à la confirmation. Les deux sont
   * des écrans, donc le dialogue se ferme.
   */
  private leaveFor(placed: { readonly id: string; readonly settlement: string }): void {
    this.ref.close();
    void this.router.navigate(
      placed.settlement === 'due' ? ['/reglement', placed.id] : ['/confirmation-de-commande'],
    );
  }
}
