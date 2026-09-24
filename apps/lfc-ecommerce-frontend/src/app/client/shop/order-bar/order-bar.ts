import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { instantToLocal } from '@lfd/contracts';
import { FoldButtonComponent } from 'fold-ng';

import { ClientCart } from '../../cart/client-cart.service';
import { formatCents } from '../../format-money';

import { ClientAudience } from '../../client-audience.service';
import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { commandTermsCopy } from '../../copy/screens/command-terms.copy';
import { serviceWhenLabel } from '../../format-day';
import { OrderContextStore } from '../../order-context.store';
import { pickupOffer } from '../pickup-discount';
import { ServicePoints } from '../pickup-points.store';

/**
 * **La barre « Ma commande »** — la maison et l'heure retenues à gauche, le
 * panier et le geste de régler à droite, à cheval sur la couture du rayon
 * (handoff boutique, SPEC §2 ; plan « boutique pro — cartes et fiche », lot 2).
 *
 * Elle s'appelait `PublicCommandTermsSummary` tant qu'elle ne faisait que
 * rappeler les termes. Elle porte désormais le règlement : au bureau, c'est
 * elle — et non plus le pied — qui y mène.
 *
 * Il rend visible ce que le visiteur vient de décider à l'accueil, à l'endroit
 * où il va dépenser : le prix et ce qui sera chaud dépendent des deux, et les
 * laisser hors de l'écran obligerait à se souvenir.
 *
 * ## Deux gestes, et non un
 *
 * 🔴 « Changer de maison » et « changer l'heure » sont SÉPARÉS. Un unique
 * « Modifier » renverrait à l'écran du mode de service, qui repose les deux
 * questions — vouloir une autre heure ferait re-choisir la maison. L'heure se
 * change donc ici même, sans quitter le rayon ; la maison seule vaut un retour
 * à l'accueil, puisque c'est elle qui commande les heures offertes.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne se montre PAS sans choix. « Je n'ai pas encore dit où je suis servi »
 * est un état de plein droit — on visite d'abord, on choisit ensuite — et une
 * carte qui dirait « aucune maison » transformerait cette liberté en manque.
 * Le pied reste alors le seul chemin vers le règlement, et c'est lui qui
 * demande le service au moment où il devient nécessaire.
 *
 * Elle ne décide pas de ce que « régler » veut dire : elle émet `pay`, et
 * l'écran tranche (service manquant, invité, passation).
 */
@Component({
  selector: 'app-order-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './order-bar.html',
  styleUrl: './order-bar.scss',
})
export class OrderBar {
  /** Retourner choisir la maison — c'est elle qui commande les heures offertes. */
  readonly houseRequested = output<void>();

  /** Rouvrir le sélecteur d'heure, sur la maison déjà retenue. */
  readonly timeRequested = output<void>();

  /** Régler — l'écran sait ce que ça demande encore (service, identité). */
  readonly pay = output<void>();

  private readonly cart = inject(ClientCart);

  private readonly order = inject(OrderContextStore);
  private readonly locale = inject(ClientLocale);
  private readonly points = inject(ServicePoints);
  private readonly t = inject(ClientCopyService).t;

  /** Un visiteur est `b2c` — et le défaut penche de ce côté tant qu'on ne sait pas. */
  private readonly audience = inject(ClientAudience).shown;

  protected readonly c = computed(() => commandTermsCopy(this.locale.current()));

  protected readonly choice = this.order.choice;

  /** Le compte de pièces du panier — celui que le pied lisait déjà. */
  protected readonly count = this.cart.count;

  /** Le total du DEVIS, remise déduite : c'est ce que le règlement demandera. */
  protected readonly total = computed(() => formatCents(this.cart.totals().totalCents));

  /**
   * « 3 pièces · −1,20 € de remise ». La remise vient du devis, jamais d'un
   * calcul d'écran ; nulle, elle se TAIT — « −0,00 € » annoncerait un gain qui
   * n'existe pas.
   */
  protected readonly meta = computed(() => {
    const copy = this.c();
    const n = this.count();
    const pieces = fill(n > 1 ? copy.pieceMany : copy.pieceOne, { n: String(n) });
    const discount = this.cart.totals().discountCents;
    return discount > 0
      ? `${pieces} · ${fill(copy.discount, { amount: formatCents(discount) })}`
      : pieces;
  });

  constructor() {
    // Les points portent la remise, et la boutique n'a pas eu à les lire.
    // Idempotent : y revenir depuis l'accueil ne redemande rien.
    void this.points.hydrate();
  }

  /**
   * La remise du point retenu — « −10 % » —, ou `null`.
   *
   * 🔴 Elle est RELUE du point, jamais portée par le choix : le store refuse
   * les montants (« l'identité, jamais le montant ») parce qu'une remise
   * dépend de la clientèle et que le serveur seul la tient devant la facture.
   * `pickupOffer` est le lecteur unique de ce que promet un point — la carte
   * et le dialogue se sont déjà contredits sur un pourcentage pour avoir
   * calculé chacun le sien (20 % / 10 %, corrigé le 2026-09-15).
   *
   * ⚠️ `null` dès qu'il n'y a pas de VRAIE remise : sans offre, `pickupOffer`
   * rend « Prix boutique », qui est un tarif et non un gain. L'afficher dans
   * une pastille dorée annoncerait un avantage qui n'existe pas.
   */
  protected readonly offer = computed(() => {
    const service = this.choice();
    if (service === null || service.mode !== 'pickup' || service.pickupAddressId === null) {
      return null;
    }
    const point = this.points
      .pickups()
      .find((candidate) => candidate.id === service.pickupAddressId);
    if (point === undefined) {
      return null;
    }
    const offer = pickupOffer(point, this.audience(), this.t().pickupDialog);
    return offer.hasOffer ? offer.label : null;
  });

  /**
   * « demain 7 h 15 » — la journée dite d'un mot quand elle en a un.
   *
   * ⚠️ Le libellé de journée se lit à l'horloge du NAVIGATEUR pour savoir ce
   * qu'est « demain », mais la journée elle-même vient du serveur : on nomme
   * une date qu'on n'a pas choisie, c'est tout. Seul un onglet laissé ouvert
   * passé minuit décalerait le mot, jamais la commande.
   */
  protected readonly when = computed(() => {
    const service = this.choice();
    if (service === null) {
      return '';
    }
    const copy = this.c();
    return serviceWhenLabel(
      service.date,
      service.slot,
      instantToLocal(new Date()).day,
      this.locale.current(),
      { today: copy.today, tomorrow: copy.tomorrow },
    );
  });
}
