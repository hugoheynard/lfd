import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { addDays, instantToLocal } from '@lfd/contracts';
import type { DeliveryAddressView, FulfillmentWindow, Weekday } from '@lfd/contracts';
// Sans zod, par le sous-chemin : ce dialogue s'ouvre depuis l'accueil (budget `cloudflare`).
import { resolveWindowMode } from '@lfd/contracts/shop-values';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldPanelHeaderComponent,
  FoldTimeComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { addressAt, ClientAddresses } from '../../client-addresses.service';
import { fill } from '../../copy/client-copy.service';
import { deliveryAddressCopy } from '../../copy/screens/delivery-address.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { ClientLocale } from '../../client-locale.service';
import { serviceDayLabel } from '../../format-day';
import { formatWindow } from '../../format-hour';
import { formatCents, formatRate } from '../../format-money';
import type { ServiceChoice } from '../../order-context.store';
import { dialogSide } from '../../panel-side';
import { ORDER_DIALOG } from '../order-dialog';
import {
  bookSlotsOfDay,
  deadlinesOfDay,
  deliveryWindowOf,
  slotKey,
  weekdayOfIsoDate,
} from '../delivery-window';
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

  /**
   * La journée déjà retenue, pour la reproposer — `null` ou absente : la
   * première journée que le serveur accorde.
   */
  readonly currentDate?: string | null;
}

/**
 * Combien de journées de livraison se proposent, à partir de la première que
 * le serveur accorde — la même largeur que les onglets du retrait
 * (`slot-picker-dialog`, `DAYS_SHOWN`).
 *
 * ⚠️ Une largeur d'ÉCRAN, pas une promesse : `GET /fulfillment-days` ne rend
 * que la PREMIÈRE journée (vérifié le 2026-10-13, `ListFulfillmentDaysHandler`).
 * Les suivantes sont fabriquées par `addDays`, comme au retrait, et
 * `ensureWithinOrderCutoff` reste l'autorité à la commande.
 */
const DELIVERY_DAYS_SHOWN = 7;

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
 * ⚠️ **Depuis CA1b (2026-10-03), l'heure se convient ici.** Depuis le
 * 2026-10-12 (Hugo : « seules les échéances inscrites sont valides »), une
 * adresse du carnet ne propose QUE ses échéances ou créneaux inscrits pour ce
 * jour — plus d'« autre heure », plus de créneau tapé. Seule la saisie libre
 * (un visiteur sans carnet) tape encore son heure. Le paragraphe qui suit est
 * l'historique d'avant.
 *
 * 🔴 **Aucune grille d'heures.** Celle de `/nouvelle-commande` est décorative :
 * `requestedWindow` ne part qu'en RETRAIT (`client-orders.service.ts`), et ses
 * heures viennent de `DELIVERY_SLOTS`, qui dit lui-même n'affirmer rien de
 * vrai. La supprimer ne retire donc RIEN de la commande.
 *
 * Ce que les rangées montrent à la place est vrai : la fenêtre que le CARNET
 * déclare pour cette adresse, quand il en déclare une.
 *
 * Elle atteint la commande par le serveur : le choix porte l'`id` de
 * l'adresse du carnet, `payloadOf` l'envoie en `deliveryAddressId`, et le
 * serveur en lit la fenêtre, le contact et la signature (vérifié le
 * 2026-09-29 ; jusque-là l'identifiant partait à `null` en dur et la fenêtre
 * affichée n'était qu'une promesse). Le front, lui, n'envoie toujours aucune
 * heure de livraison.
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
    FoldListboxComponent,
    FoldPanelBodyComponent,
    FoldTimeComponent,
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
  private readonly ref = inject(FoldPanelRef);
  private readonly locale = inject(ClientLocale);

  /**
   * 🔴 Le carnet vient de NOTRE BASE. Une adresse d'exemple posée à côté d'une
   * commande réelle est une livraison à la mauvaise porte — et un carton déposé
   * chez quelqu'un d'autre ne se corrige pas au téléphone.
   */
  private readonly book = inject(ClientAddresses).deliveries;

  protected readonly c = screenCopy('deliveryAddress', deliveryAddressCopy);

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
        window: windowOf(address, copy.window, copy.when.before),
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

  // ─── L'heure de la livraison (CA3, CA1b — 2026-10-03) ─────────────────────

  /** L'échéance retenue dans la liste inscrite, ou `''`. */
  protected readonly deadlinePick = signal('');
  /** L'heure tapée — saisie libre seulement : un visiteur n'a pas d'échéance inscrite. */
  protected readonly typedDeadline = signal('');
  /** Le créneau du carnet retenu (sa clé), quand le jour en porte plusieurs. */
  protected readonly slotPick = signal('');
  protected readonly slotStart = signal('');
  protected readonly slotEnd = signal('');

  /** L'adresse du carnet retenue — `null` pour une saisie libre. */
  private readonly bookAddress = computed(() =>
    this.freeEntry() ? null : (this.chosen()?.address ?? null),
  );

  /** Créneau ou échéance : celui de l'adresse, sinon le réglage général. */
  protected readonly windowMode = computed(() =>
    resolveWindowMode(
      this.bookAddress()?.specs.windowMode,
      this.points.deliveryAvailability().windowMode ?? 'deadline',
    ),
  );

  // ─── Le jour de la livraison (Hugo, 2026-10-13 : « je ne peux pas choisir le jour ») ───

  /** Le jour choisi dans la liste, ou `''` : la journée retenue, sinon la première. */
  protected readonly datePick = signal('');

  /**
   * Les journées proposables : la première que le serveur accorde, puis les
   * suivantes jusqu'à {@link DELIVERY_DAYS_SHOWN}, jamais au-delà du dernier
   * jour d'une opération du panier ({@link ServicePoints.lastDay}).
   */
  private readonly offeredDates = computed<readonly string[]>(() => {
    const first = this.points.nextDayFor(null);
    if (first === null) {
      return [];
    }
    const last = this.points.lastDay();
    return Array.from({ length: DELIVERY_DAYS_SHOWN }, (_unused, index) =>
      addDays(first, index),
    ).filter((date, index) => index === 0 || last === null || date <= last);
  });

  /**
   * Les journées où l'adresse du carnet a une heure INSCRITE — les seules
   * valides depuis le 2026-10-12. Si aucune n'en a, toutes restent : le refus
   * « aucune heure inscrite » dit alors où se règlent les heures, plutôt
   * qu'une liste vide muette.
   */
  private readonly deliverableDates = computed<readonly string[]>(() => {
    const dates = this.offeredDates();
    if (this.freeEntry()) {
      return dates;
    }
    const kept = dates.filter((date) => this.hasRegisteredTime(weekdayOfIsoDate(date)));
    return kept.length === 0 ? dates : kept;
  });

  protected readonly dateOptions = computed(() => {
    const copy = this.c().day;
    const today = instantToLocal(new Date()).day;
    const locale = this.locale.current();
    return this.deliverableDates().map((date) => ({
      value: date,
      label: serviceDayLabel(date, today, locale, {
        today: copy.today,
        tomorrow: copy.tomorrow,
      }),
    }));
  });

  /** La journée livrée : le choix, sinon celle déjà retenue, sinon la première. */
  protected readonly date = computed<string | null>(() => {
    const dates = this.deliverableDates();
    const picked = this.datePick();
    if (dates.includes(picked)) {
      return picked;
    }
    const current = this.data().currentDate ?? null;
    if (current !== null && dates.includes(current)) {
      return current;
    }
    return dates[0] ?? null;
  });

  private readonly day = computed(() => {
    const date = this.date();
    return date === null ? null : weekdayOfIsoDate(date);
  });

  private readonly dayDeadlines = computed(() =>
    deadlinesOfDay(this.bookAddress()?.specs.deadlines, this.day()),
  );

  /** Les créneaux du carnet pour ce jour (CA3b) — plusieurs possibles. */
  private readonly daySlots = computed(() => bookSlotsOfDay(this.bookAddress(), this.day()));

  /** Changer de jour périme l'heure : les heures d'un jour ne valent pas pour un autre. */
  protected pickDate(date: string): void {
    if (date !== this.date()) {
      this.deadlinePick.set('');
      this.slotPick.set('');
    }
    this.datePick.set(date);
  }

  /** L'adresse du carnet a-t-elle une heure inscrite ce jour-là, dans son mode ? */
  private hasRegisteredTime(day: Weekday | null): boolean {
    const address = this.bookAddress();
    return this.windowMode() === 'deadline'
      ? deadlinesOfDay(address?.specs.deadlines, day).length > 0
      : bookSlotsOfDay(address, day).length > 0;
  }

  /**
   * Faut-il taper un créneau ? Seulement en saisie libre : une adresse du
   * carnet n'admet que ses créneaux inscrits (2026-10-12).
   */
  protected readonly asksSlot = computed(() => this.freeEntry() && this.windowMode() === 'slot');

  /**
   * L'adresse du carnet n'a AUCUNE heure inscrite pour ce jour dans son mode :
   * rien à choisir, rien à taper — elle se règle dans « Mon compte ».
   */
  protected readonly noneRegistered = computed(
    () =>
      !this.freeEntry() &&
      (this.windowMode() === 'deadline'
        ? this.dayDeadlines().length === 0
        : this.daySlots().length === 0),
  );

  /** Plusieurs créneaux au carnet ce jour-là : on en choisit un. */
  protected readonly slotOptions = computed(() => {
    const slots = this.daySlots();
    const before = this.c().when.before;
    return this.windowMode() !== 'slot' || slots.length < 2
      ? []
      : slots.map((slot) => ({
          value: slotKey(slot),
          label: formatWindow(slot.start, slot.end, before),
        }));
  });

  /** L'option montrée : le choix, ou rien — plusieurs créneaux ne se devinent pas. */
  protected readonly slotValue = computed(() => {
    const picked = this.slotPick();
    return this.slotOptions().some((option) => option.value === picked) ? picked : '';
  });

  /** Les SEULES échéances proposées : celles que l'adresse inscrit pour ce jour. */
  protected readonly deadlineOptions = computed(() => {
    const before = this.c().when.before;
    return this.dayDeadlines().map((time) => ({
      value: time,
      label: formatWindow(null, time, before),
    }));
  });

  /** L'option montrée : le choix, sinon la seule échéance du jour, que le serveur reprend. */
  protected readonly deadlineValue = computed(() => {
    const picked = this.deadlinePick();
    if (picked !== '') {
      return picked;
    }
    const times = this.dayDeadlines();
    return times.length === 1 ? (times[0] ?? '') : '';
  });

  /** La fenêtre envoyée ; `undefined` tant qu'il manque une heure. */
  private readonly window = computed<FulfillmentWindow | null | undefined>(() => {
    const free = this.freeEntry();
    return deliveryWindowOf({
      mode: this.windowMode(),
      dayDeadlines: this.dayDeadlines(),
      daySlots: this.daySlots(),
      // Une heure tapée ne part qu'en saisie libre ; au carnet, seule la liste.
      deadline: free ? this.typedDeadline() : this.deadlinePick(),
      slot: this.slotPick(),
      slotStart: free ? this.slotStart() : '',
      slotEnd: free ? this.slotEnd() : '',
    });
  });

  /** Ce qu'il manque, dit sous l'action — `null` quand l'heure est là. */
  protected readonly windowMissing = computed(() => {
    if (this.window() !== undefined) {
      return null;
    }
    if (this.noneRegistered()) {
      return this.c().when.noneRegistered;
    }
    if (this.windowMode() === 'deadline') {
      return this.c().when.missingDeadline;
    }
    return this.slotOptions().length > 0
      ? this.c().when.missingBookSlot
      : this.c().when.missingSlot;
  });

  /** L'action est-elle ouverte ? L'adresse, puis l'heure — une livraison ne part plus sans. */
  protected readonly ready = computed(
    () =>
      (this.freeEntry() ? this.freeReady() : this.chosen() !== null) && this.window() !== undefined,
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
    if (entry.address.id !== this.chosen()?.address.id) {
      // Les échéances d'un lieu ne valent pas pour un autre.
      this.deadlinePick.set('');
      this.slotPick.set('');
    }
    this.picked.set(entry.address.id);
  }

  /** Le libellé de la fenêtre envoyée, ou `''` quand elle vient du carnet. */
  private windowLabel(window: FulfillmentWindow | null): string {
    return window === null ? '' : formatWindow(window.start, window.end, this.c().when.before);
  }

  /**
   * Rend le mode de service COMPLET.
   *
   * 🔴 La fenêtre (CA3, CA1b — 2026-10-03) : celle que le client vient de
   * convenir — une échéance, ou le créneau qui manquait —, sinon `null` quand
   * le carnet la fournit et que le serveur la lit à partir de
   * `deliveryAddressId`. Jamais aucune : une livraison ne part plus sans heure.
   *
   * 🔴 Le CODE POSTAL, jamais le tarif : la zone s'en déduit côté serveur, qui
   * applique alors le même barème que la facture.
   */
  protected confirm(): void {
    const date = this.date();
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
    const window = this.window();
    if (window === undefined) {
      return;
    }
    this.ref.close({
      mode: 'delivery',
      window,
      place: entry.name,
      at: addressAt(entry.name),
      address: `${address.ligne1}, ${address.codePostal}`,
      codePostal: address.codePostal,
      // La fenêtre du carnet tient lieu de libellé quand elle existe ; sinon
      // rien, et l'écran qui l'affiche ne dira que la journée.
      slot: this.windowLabel(window) || windowOf(address, '{window}', this.c().when.before),
      date,
      deliveryAddressId: address.id,
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
    const window = this.window();
    if (window === undefined) {
      return;
    }
    this.ref.close({
      mode: 'delivery',
      window,
      place: ligne1,
      at: addressAt(ligne1),
      address: `${ligne1}, ${codePostal}`,
      codePostal,
      slot: this.windowLabel(window),
      date,
      deliveryAddressId: null,
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
 * 🔴 **`everyday` SEULEMENT.** Un carnet peut déclarer ses créneaux par JOUR
 * (`perDay`) ; la journée de livraison ne se choisit pas ici, donc en nommer un
 * reviendrait à tirer un jour au sort. Une adresse sans créneau global ne dit
 * rien — elle se livre dans la tournée, et annoncer une heure serait exactement
 * la promesse que ce parcours refuse d'écrire.
 *
 * ⚠️ `formatWindow` et non un gabarit local : la même fenêtre s'écrit déjà dans
 * quatre surfaces de l'app, et une cinquième façon de la composer finirait par
 * différer d'un tiret.
 */
function windowOf(address: DeliveryAddressView, gabarit: string, before: string): string {
  // Jour `null` : seuls les créneaux « tous les jours » répondent (CA3b).
  const slots = bookSlotsOfDay(address, null);
  if (slots.length === 0) {
    return '';
  }
  const text = slots.map((slot) => formatWindow(slot.start, slot.end, before)).join(' · ');
  return fill(gabarit, { window: text });
}
