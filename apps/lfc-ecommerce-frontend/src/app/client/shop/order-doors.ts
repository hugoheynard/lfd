import { computed, inject, Injectable } from '@angular/core';
import { instantToLocal } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';

import { ClientAudience } from '../client-audience.service';
import { ClientFeatureAccess } from '../feature-access/client-feature-access.service';
import { formatHour } from '../format-hour';
import { OrderContextStore } from '../order-context.store';
import { DeliveryAddressDialog } from './delivery-address-dialog/delivery-address-dialog';
import { ServicePoints } from './pickup-points.store';
import { PublicHousePickerDialog } from './public-house-picker-dialog/public-house-picker-dialog';
import { SlotPickerDialog } from './slot-picker-dialog/slot-picker-dialog';

/**
 * **Les portes de la commande** — retrait ou livraison, en dialogues.
 *
 * 🔴 UN SEUL ENDROIT POSE CES QUESTIONS, et un seul écrit la réponse. Elles
 * vivaient sur `/nouvelle-commande`, un ÉCRAN : le panier et la boutique y
 * envoyaient qui n'avait pas encore choisi, et on quittait donc ce qu'on était
 * en train de faire pour répondre. L'accueil public a cessé d'y aller le
 * 2026-09-20 en ouvrant les mêmes dialogues sur place — mais en recopiant la
 * séquence chez lui. Ce service la lui reprend, pour que le panier et la
 * boutique l'appellent au lieu d'en écrire une troisième version.
 *
 * ⚠️ **Il écrit dans {@link OrderContextStore} et ne navigue pas.** Où aller
 * après dépend de qui a demandé — la boutique reste où elle est, l'accueil
 * part au rayon — et un service qui déciderait de la destination obligerait
 * chaque appelant à défaire ce qu'il vient de faire.
 *
 * Il rend `true` quand un choix a été pris. Fermer un dialogue n'est pas
 * choisir : on rend `false` et rien n'est écrit, de sorte qu'un appelant ne
 * peut pas prendre une fermeture pour une réponse.
 */
@Injectable({ providedIn: 'root' })
export class OrderDoors {
  private readonly panels = inject(FoldPanelHostService);
  private readonly points = inject(ServicePoints);
  private readonly order = inject(OrderContextStore);
  private readonly access = inject(ClientFeatureAccess);

  /** Un visiteur est `b2c` — et le défaut penche de ce côté tant qu'on ne sait pas. */
  private readonly audience = inject(ClientAudience).shown;

  /**
   * **La porte du coursier est-elle ouverte à qui regarde ?**
   *
   * 🔴 Un PRO livre par son CONTRAT : sa porte ne lit pas la clé, et la fermer
   * lui retirerait un service qu'il a négocié. Pour tout le monde d'autre, la
   * livraison est une décision d'admin (`publicDelivery`), fermée par défaut —
   * ouvrir une tournée à qui n'a pas de compte n'est pas un réglage d'écran.
   *
   * ⚠️ **Cacher n'est pas fermer, et les deux existent.** `POST /shop/orders`
   * refuse la même chose en 409 : sans ce refus, une requête recopiée depuis
   * l'onglet réseau ferait livrer quand même. Ce signal-ci évite seulement de
   * montrer une porte qui mène à un refus.
   */
  readonly deliveryOpen = computed(
    () => this.audience() === 'b2b' || this.access.publicDelivery() === 'open',
  );

  /**
   * **La porte du RETRAIT** : où, puis quand.
   *
   * Deux dialogues successifs et non un à deux volets — ce sont ceux qui
   * existent. L'écart avec la maquette est assumé et signalé ailleurs ;
   * l'enchaînement est le même pour qui l'utilise.
   *
   * Fermer le second sans prendre d'heure ne retient RIEN, pas même la maison :
   * un point de retrait sans créneau n'est pas un mode de service, et
   * l'enregistrer à moitié ferait croire la question répondue.
   */
  async pickup(currentId: string | null = null): Promise<boolean> {
    const point = await PublicHousePickerDialog.open(this.panels, { currentId }).closed;
    if (point === undefined) {
      return false;
    }
    return this.pickTime(point.id, point.label || point.ville, `${point.ligne1}, ${point.ville}`);
  }

  /**
   * **Rouvrir l'heure seule**, la maison étant déjà prise.
   *
   * ⚠️ Changer de maison PÉRIME l'heure — les créneaux sont ceux d'un point —
   * mais changer d'heure ne périme pas la maison. D'où deux entrées, et non un
   * drapeau sur la même.
   */
  async time(pickupAddressId: string, place: string, address: string): Promise<boolean> {
    return this.pickTime(pickupAddressId, place, address);
  }

  /**
   * **La porte du COURSIER** : l'adresse, et rien d'autre.
   *
   * Aucune grille d'heures : le dialogue d'adresse rend un mode de service
   * COMPLET, fenêtre comprise (c'est-à-dire `null`, et son composant dit
   * pourquoi). Il n'y a donc pas de second volet à enchaîner.
   *
   * ⚠️ Elle ne s'ouvre PAS quand {@link deliveryOpen} est faux — elle rend
   * `false` sans rien montrer. L'appelant qui cache déjà sa porte n'y arrive
   * jamais ; celui qui l'aurait oubliée ne fait pas de dégât.
   */
  async delivery(currentId: string | null = null): Promise<boolean> {
    if (!this.deliveryOpen()) {
      return false;
    }
    const choice = await DeliveryAddressDialog.open(this.panels, {
      currentId,
      // 🔴 LA SAISIE LIBRE EST POUR LE B2C, et elle lui est réservée. Un pro
      // tape une adresse hors de son carnet, et c'est une livraison que
      // personne ne retrouve au bon de livraison suivant ; un visiteur n'a pas
      // de carnet du tout, et sans elle il ne peut pas se faire livrer.
      allowFreeEntry: this.audience() !== 'b2b',
    }).closed;
    if (choice === undefined) {
      return false;
    }
    this.order.choice.set(choice);
    return true;
  }

  /**
   * L'heure d'un point, puis l'écriture du choix.
   *
   * 🔴 La forme du choix est celle que `pickup-dialog` fabrique déjà — mêmes
   * champs, mêmes raisons : l'identité du point et JAMAIS un montant (le
   * serveur chiffre), le libellé POUR L'ÉCRAN et la fenêtre POUR LE SERVEUR, la
   * journée telle que le serveur l'a accordée.
   */
  private async pickTime(
    pickupAddressId: string,
    place: string,
    address: string,
  ): Promise<boolean> {
    const slot = await SlotPickerDialog.open(this.panels, {
      pickupAddressId,
      place,
      // La journée vient du SERVEUR, heure limite comprise. `null` = aucune
      // journée demandable ici, et le dialogue le dit plutôt que d'en inventer.
      firstDay: this.points.nextDayFor(pickupAddressId),
    }).closed;
    if (slot === undefined) {
      return false;
    }
    this.order.choice.set({
      mode: 'pickup',
      place,
      // Le complément (« au Labo ») n'a pas de source serveur : il se dérive du
      // libellé. Juste pour un lieu masculin, faux pour un féminin — c'est une
      // dette de contrat, et `pickup-dialog` la porte déjà à l'identique.
      at: `au ${place}`,
      address,
      pickupAddressId,
      slot: formatHour(slot.time),
      // La fin vient de l'instant UTC du créneau, pas d'une addition d'écran :
      // le pas de découpe appartient à la règle du point, que la boutique ne
      // connaît pas.
      window: { start: slot.time, end: instantToLocal(new Date(slot.endAt)).time },
      date: slot.day,
    });
    return true;
  }
}
