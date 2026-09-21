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
  FoldCalloutComponent,
  FoldInputComponent,
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

  /**
   * **La saisie libre est-elle permise ?** (Hugo, 2026-09-21)
   *
   * 🔴 C'est l'APPELANT qui tranche, parce que c'est lui qui sait à qui il
   * parle : un visiteur n'a pas de carnet et doit pouvoir taper son adresse ;
   * un pro en a un, et une adresse tapée hors carnet créerait une livraison que
   * personne ne retrouverait au bon de livraison suivant. Le dialogue ne
   * devinerait pas — un carnet vide peut être celui d'un pro dont `GET /me`
   * n'a pas encore répondu.
   */
  readonly allowFreeEntry?: boolean;
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
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
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

  /** Les quatre champs de la saisie libre. Ils ne servent QUE cette commande. */
  protected readonly ligne1 = signal('');
  protected readonly ligne2 = signal('');
  protected readonly codePostal = signal('');
  protected readonly ville = signal('');

  /** Vrai quand l'écran montre le formulaire plutôt que le carnet. */
  protected readonly freeEntry = computed(
    () => this.data().allowFreeEntry === true && this.book().length === 0,
  );

  /** La zone du code postal tapé, `null` tant qu'il n'en touche aucune. */
  private readonly typedZone = computed(() => {
    const code = this.codePostal().trim();
    return code === '' ? null : this.points.zoneFor(code);
  });

  /** Le tarif de la zone tapée, pour l'action. */
  protected readonly typedFee = computed(() => {
    const zone = this.typedZone();
    return zone === null ? '' : feeOf(zone.fee);
  });

  /**
   * Le refus de la saisie libre : un code postal tapé ENTIER qu'aucune zone ne
   * dessert.
   *
   * ⚠️ On attend qu'il soit complet — cinq chiffres — au lieu de refuser dès la
   * première frappe : un « 7 » n'est pas hors zone, il est inachevé, et le dire
   * ferait lire un refus à chaque caractère.
   */
  protected readonly typedOutOfZone = computed(
    () => this.codePostal().trim().length >= POSTAL_CODE_LENGTH && this.typedZone() === null,
  );

  private readonly freeReady = computed(
    () => this.ligne1().trim() !== '' && this.ville().trim() !== '' && this.typedZone() !== null,
  );

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

  /** L'action est-elle ouverte ? Les deux modes répondent, chacun pour soi. */
  protected readonly ready = computed(() =>
    this.freeEntry() ? this.freeReady() : this.chosen() !== null,
  );

  protected readonly ctaLabel = computed(() => {
    if (this.freeEntry()) {
      const fee = this.typedFee();
      return this.freeReady() ? fill(this.c().cta, { fee }) : this.c().ctaIdle;
    }
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
    const date = this.points.nextDayFor(null);
    if (date === null) {
      return;
    }
    if (this.freeEntry()) {
      this.confirmTyped(date);
      return;
    }
    const entry = this.chosen();
    if (entry === null) {
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

  /**
   * L'adresse TAPÉE, rendue au même format que celle du carnet.
   *
   * 🔴 Ni identifiant ni fenêtre : elle n'existe dans aucun carnet, donc elle
   * ne promet aucune heure. Le serveur en déduit la zone depuis le code postal,
   * et applique le barème de la facture — c'est pourquoi rien ici ne porte de
   * montant.
   *
   * ⚠️ Le libellé est l'ADRESSE elle-même : il n'y a pas de nom d'usage à
   * afficher, et en inventer un (« Mon adresse ») ferait figurer sur la
   * commande un mot que personne n'a tapé.
   */
  private confirmTyped(date: string): void {
    const ligne1 = this.ligne1().trim();
    const ville = this.ville().trim();
    const codePostal = this.codePostal().trim();
    this.ref.close({
      mode: 'delivery',
      window: null,
      place: ligne1,
      at: addressAt(ligne1),
      address: `${ligne1}, ${codePostal}`,
      codePostal,
      slot: '',
      date,
      deliveryAddress: {
        label: ligne1,
        ligne1,
        ligne2: this.ligne2().trim(),
        codePostal,
        ville,
        pays: PAYS,
      },
    });
  }
}

/**
 * Le pays de la saisie libre.
 *
 * ⚠️ En dur, et c'est assumé : la maison livre en station, et aucun champ
 * d'écran ne demande le pays. Le jour où une zone franchit la frontière, c'est
 * un champ de plus — pas une valeur à deviner ici.
 */
const PAYS = 'France';

/** Un code postal français en compte cinq — ce qui rend « complet » vérifiable. */
const POSTAL_CODE_LENGTH = 5;

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
