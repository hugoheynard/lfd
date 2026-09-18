import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { instantToLocal } from '@lfd/contracts';

import { ClientAudience } from '../../client-audience.service';
import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { commandTermsCopy } from '../../copy/screens/command-terms.copy';
import { serviceWhenLabel } from '../../format-day';
import { OrderContextStore } from '../../order-context.store';
import { pickupOffer } from '../pickup-discount';
import { ServicePoints } from '../pickup-points.store';

/**
 * **Les termes de la commande en cours** — la maison et l'heure retenues,
 * rappelées au-dessus du rayon.
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
 * La barre du bas et le règlement demandent le service au moment où il devient
 * nécessaire.
 */
@Component({
  selector: 'app-public-command-terms-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './public-command-terms-summary.html',
  styleUrl: './public-command-terms-summary.scss',
})
export class PublicCommandTermsSummary {
  /** Retourner choisir la maison — c'est elle qui commande les heures offertes. */
  readonly houseRequested = output<void>();

  /** Rouvrir le sélecteur d'heure, sur la maison déjà retenue. */
  readonly timeRequested = output<void>();

  private readonly order = inject(OrderContextStore);
  private readonly locale = inject(ClientLocale);
  private readonly points = inject(ServicePoints);
  private readonly t = inject(ClientCopyService).t;

  /** Un visiteur est `b2c` — et le défaut penche de ce côté tant qu'on ne sait pas. */
  private readonly audience = inject(ClientAudience).shown;

  protected readonly c = computed(() => commandTermsCopy(this.locale.current()));

  protected readonly choice = this.order.choice;

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
