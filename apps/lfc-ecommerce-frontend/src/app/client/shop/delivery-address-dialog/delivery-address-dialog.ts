import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { DeliveryAddressView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { addressAt, ClientAddresses } from '../../client-addresses.service';
import { ClientLocale } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import { deliveryAddressCopy } from '../../copy/screens/delivery-address.copy';
import { formatWindow } from '../../format-hour';
import { formatCents, formatRate } from '../../format-money';
import type { ServiceChoice } from '../../order-context.store';
import { dialogSide } from '../../panel-side';
import { ORDER_DIALOG } from '../order-dialog';
import { ServicePoints } from '../pickup-points.store';

/** Ce qu'il faut pour ouvrir la porte : l'adresse déjà retenue, s'il y en a une. */
export interface DeliveryAddressData {
  readonly currentId: string | null;
}

/** Une adresse du carnet, telle que la rangée l'affiche. */
interface Entry {
  readonly address: DeliveryAddressView;
  readonly name: string;
  readonly place: string;
  /** Le tarif de la zone, dans sa forme — ou `''` hors zone. */
  readonly fee: string;
  /** `true` quand le code postal ne tombe dans aucune zone servie. */
  readonly outOfZone: boolean;
  /** La fenêtre que le CARNET déclare, ou `''`. */
  readonly window: string;
  readonly isDefault: boolean;
  readonly selected: boolean;
}

/**
 * **« On livre où ? »** — la porte du coursier de l'accueil pro.
 *
 * Symétrique du sélecteur de maison : même châssis, même largeur, même geste —
 * la rangée sélectionne, le pied confirme. Les deux portes de l'accueil mènent
 * donc au même enchaînement.
 *
 * ## Ce qu'il ne fait PAS, et pourquoi
 *
 * 🔴 **Aucune grille d'heures.** Celle de `/nouvelle-commande` est décorative :
 * `requestedWindow` ne part qu'en RETRAIT (`client-orders.service.ts`), et ses
 * heures viennent de `DELIVERY_SLOTS`, qui dit lui-même n'affirmer rien de
 * vrai. La supprimer ne retire donc RIEN de la commande.
 *
 * Ce que les rangées montrent à la place est vrai : la fenêtre que le CARNET
 * déclare pour cette adresse, quand il en déclare une.
 *
 * ⚠️ **Elle n'est pas pour autant APPLIQUÉE, et il faut le dire.** Le
 * commentaire de `client-orders.service.ts` annonce que « le serveur la lit à
 * partir de `deliveryAddressId` » — c'est une INTENTION : `payloadOf` envoie
 * `deliveryAddressId: null`, en dur, pour toutes les commandes (vérifié le
 * 2026-09-20). Tant que cet identifiant ne part pas, aucune fenêtre de
 * livraison n'atteint la commande. Ce que cet écran affiche est donc ce que le
 * carnet PROMET, pas ce qui sera exécuté — et c'est déjà mieux qu'une grille
 * inventée, qui ne promettait rien de vrai du tout.
 *
 * 🔴 **Aucune saisie libre.** Cette porte est celle d'un pro, dont le carnet
 * appartient à sa société et se tient dans « Mon compte ». Un champ libre y
 * créerait une adresse que personne ne retrouverait au bon de livraison
 * suivant.
 *
 * ⚠️ Le carnet du visiteur, lui, n'existe pas — d'où l'état vide, qui dit où
 * les adresses se règlent au lieu d'ouvrir un formulaire.
 */
@Component({
  selector: 'app-delivery-address-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './delivery-address-dialog.html',
  styleUrl: './delivery-address-dialog.scss',
})
export class DeliveryAddressDialog {
  static readonly foldPanel: FoldPanelDefaults = ORDER_DIALOG;

  /**
   * Ouvre la porte. Rend le mode de service complet, ou `undefined` si l'on
   * ferme sans choisir — fermer n'est pas choisir.
   */
  static open(
    panels: FoldPanelHostService,
    data: DeliveryAddressData,
  ): FoldPanelRef<ServiceChoice | undefined> {
    return panels.open<DeliveryAddressData, ServiceChoice | undefined>(DeliveryAddressDialog, {
      side: dialogSide(),
      stack: true,
      data,
    });
  }

  readonly data = input.required<DeliveryAddressData>();

  private readonly points = inject(ServicePoints);
  private readonly locale = inject(ClientLocale);
  private readonly ref = inject(FoldPanelRef);

  /**
   * 🔴 Le carnet vient de NOTRE BASE. Une adresse d'exemple posée à côté d'une
   * commande réelle est une livraison à la mauvaise porte — et un carton déposé
   * chez quelqu'un d'autre ne se corrige pas au téléphone.
   */
  private readonly book = inject(ClientAddresses).deliveries;

  protected readonly c = computed(() => deliveryAddressCopy(this.locale.current()));

  protected readonly picked = signal<string | null>(null);

  constructor() {
    // Idempotent : la boutique a souvent déjà lu les zones.
    void this.points.hydrate();
    // L'adresse par défaut se coche quand le carnet ARRIVE, pas avant : le
    // dialogue peut s'ouvrir plus vite que `GET /me` ne répond.
    effect(() => {
      const book = this.book();
      if (this.picked() === null && this.data().currentId === null && book.length > 0) {
        this.picked.set(book.find((address) => address.isDefault)?.id ?? null);
      }
    });
  }

  protected readonly entries = computed<readonly Entry[]>(() => {
    const copy = this.c();
    const selectedId = this.picked() ?? this.data().currentId;
    return this.book().map((address) => {
      const zone = this.points.zoneFor(address.codePostal);
      return {
        address,
        name: address.label || address.ligne1,
        place: `${address.ligne1} · ${address.codePostal}`,
        fee: zone === null ? '' : fill(copy.fee, { fee: feeOf(zone.fee) }),
        outOfZone: zone === null,
        window: windowOf(address, copy.window),
        isDefault: address.isDefault,
        selected: address.id === selectedId,
      };
    });
  });

  /** L'adresse retenue — et elle doit être DANS une zone servie pour compter. */
  protected readonly chosen = computed(() => {
    const entry = this.entries().find((candidate) => candidate.selected) ?? null;
    return entry === null || entry.outOfZone ? null : entry;
  });

  protected readonly ctaLabel = computed(() => {
    const entry = this.chosen();
    if (entry === null) {
      return this.c().ctaIdle;
    }
    const zone = this.points.zoneFor(entry.address.codePostal);
    return zone === null ? this.c().ctaIdle : fill(this.c().cta, { fee: feeOf(zone.fee) });
  });

  /** Une adresse hors zone se touche, mais ne se retient pas : le refus précède l'effort. */
  protected pick(entry: Entry): void {
    this.picked.set(entry.address.id);
  }

  /**
   * Rend le mode de service COMPLET.
   *
   * 🔴 `window: null`, et c'est délibéré : une heure envoyée d'ici s'écrirait
   * sur un bon de commande opposable, et aucune heure de livraison n'a de
   * source. Ni celle du carnet — voir l'avertissement en tête de classe :
   * `deliveryAddressId` ne part pas.
   *
   * 🔴 Le CODE POSTAL, jamais le tarif : la zone s'en déduit côté serveur, qui
   * applique alors le même barème que la facture.
   */
  protected confirm(): void {
    const entry = this.chosen();
    const date = this.points.nextDayFor(null);
    if (entry === null || date === null) {
      return;
    }
    const address = entry.address;
    this.ref.close({
      mode: 'delivery',
      window: null,
      place: entry.name,
      at: addressAt(entry.name),
      address: `${address.ligne1}, ${address.codePostal}`,
      codePostal: address.codePostal,
      // La fenêtre du carnet tient lieu de libellé quand elle existe ; sinon
      // rien, et l'écran qui l'affiche ne dira que la journée.
      slot: windowOf(address, '{window}'),
      date,
      deliveryAddress: {
        label: entry.name,
        ligne1: address.ligne1,
        ligne2: address.ligne2,
        codePostal: address.codePostal,
        ville: address.ville,
        pays: address.pays,
      },
    });
  }
}

/** Le tarif d'une zone, dans sa forme — un montant, ou un pourcentage du panier. */
function feeOf(fee: {
  readonly mode: string;
  readonly cents?: number;
  readonly bp?: number;
}): string {
  return fee.mode === 'amount' ? formatCents(fee.cents ?? 0) : formatRate((fee.bp ?? 0) / 100);
}

/**
 * La fenêtre que le CARNET déclare pour cette adresse, ou `''`.
 *
 * 🔴 **`everyday` SEULEMENT.** Un carnet peut déclarer un créneau par JOUR
 * (`perDay`) ; la journée de livraison ne se choisit pas ici, donc en nommer un
 * reviendrait à tirer un jour au sort. Une adresse sans créneau global ne dit
 * rien — elle se livre dans la tournée, et annoncer une heure serait exactement
 * la promesse que ce parcours refuse d'écrire.
 *
 * ⚠️ `formatWindow` et non un gabarit local : la même fenêtre s'écrit déjà dans
 * quatre surfaces de l'app, et une cinquième façon de la composer finirait par
 * différer d'un tiret.
 */
function windowOf(address: DeliveryAddressView, gabarit: string): string {
  const slots = address.specs.slots;
  if (slots.mode !== 'everyday' || slots.slot === null) {
    return '';
  }
  return fill(gabarit, { window: formatWindow(slots.slot.start, slots.slot.end, '') });
}
