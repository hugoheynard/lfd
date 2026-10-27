import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { instantToLocal, type PublicPickupSlot } from '@lfd/contracts';
import {
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import { slotPickerCopy } from '../../copy/screens/slot-picker.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { formatHour } from '../../format-hour';
import { serviceDayLabel } from '../../format-day';
import { dialogSide } from '../../panel-side';
import { ORDER_DIALOG } from '../order-dialog';
import { PublicSlots } from '../public-slots.gateway';
import { RovingRadioGroup } from '../../a11y/roving-radio-group';
import { CartBar } from '../../cart/cart-bar/cart-bar';

/** Ce qu'il faut pour ouvrir le sélecteur : la maison, et le jour. */
export interface SlotPickerData {
  readonly pickupAddressId: string;
  /** Le nom d'usage de la maison — le sur-titre le rappelle. */
  readonly place: string;
  /**
   * 🔴 LE JOUR, OBLIGATOIRE (Hugo, 2026-10-27 : « je ne veux aucune
   * incohérence »). Il se choisit au panneau du jour et nulle part ailleurs :
   * ce dialogue ne propose plus d'onglets. Les onglets de la semaine, quand on
   * l'ouvrait sans jour, étaient le « vieux panneau qui mêlait jour et heure ».
   * Le type le rend inexprimable.
   */
  readonly day: string;
  /**
   * Le créneau déjà retenu À CETTE MAISON, quand on rouvre l'heure : il est
   * présélectionné et badgé « Votre choix », comme le choix de la maison marque
   * la sienne. `time` est l'heure de début, au format du créneau (`HH:MM`).
   */
  readonly current?: { readonly day: string; readonly time: string } | null;
}

/**
 * Ce que le sélecteur rend : un créneau, ou la demande de changer de jour —
 * que la porte traite en rouvrant le panneau du jour, puis ce dialogue.
 * `undefined` : fermé sans rien choisir.
 */
export type SlotPickerResult = PublicPickupSlot | typeof CHANGE_DAY;

/** « Je change de date » : le dialogue rend la main au panneau du jour. */
export const CHANGE_DAY = 'change-day' as const;

/**
 * UNE FOURNÉE, et les créneaux qu'elle sert.
 *
 * 🔴 Le regroupement suit le BADGE, qui est la seule chose sourcée : le vendeur
 * le saisit par plage en back-office (« Première fournée », « Tout est chaud »),
 * donc des créneaux consécutifs qui partagent un badge partagent une fournée.
 *
 * ⚠️ La maquette titre ses groupes en deux temps — « MATIN · SORTIE DE
 * FOURNÉE ». La seconde moitié est le badge ; la PREMIÈRE — le moment de la
 * journée — n'a aucune source, et la déduire de l'heure ferait appeler
 * « après-ski » un créneau de 16 h en plein mois d'août. On n'écrit donc que la
 * moitié qu'on sait vraie.
 *
 * `label: null` = des créneaux sans badge. Ils gardent leur grille, sans
 * sur-titre : un groupe nommé « Autres » serait un nom qu'on a inventé.
 */
interface SlotBatch {
  readonly label: string | null;
  readonly slots: readonly PublicPickupSlot[];
}

/**
 * **« À quelle heure ? »** — l'étape 2 du parcours public (dossier
 * `handoff-bienvenue`, §4).
 *
 * Saisie ⇒ dialogue centré au bureau, feuille du bas en pile ({@link dialogSide},
 * règle « Saisir » du `CLAUDE.md` de l'app). `lg` et non `md` : des créneaux par
 * jour doivent tenir sur une ligne.
 *
 * ## Ce qu'il montre, et d'où ça vient
 *
 * Les créneaux sont **dérivés par le serveur** et lus tels quels
 * ({@link PublicSlots}) : l'heure, et le **badge** que le vendeur saisit par
 * plage en back-office — « Première fournée », « Tout est chaud ». Ce sont
 * exactement les deux choses que la référence met dans une carte.
 *
 * 🔴 **La phrase descriptive de la référence n'y est pas** (« Les viennoiseries
 * sortent à l'instant. Les pains, pas encore. »). Le dossier dit qu'elle vient
 * de `ovenHoursOf(shelfId)` : c'est faux, cette fonction est indexée par RAYON
 * et rend des amplitudes. Ces phrases n'ont aucune source ; les écrire ferait
 * promettre une fournée que personne n'a arrêtée.
 *
 * 🔴 **« Complet » est câblé mais ne peut pas s'allumer aujourd'hui.** La table
 * des réservations n'existe pas : le serveur rend donc `taken: 0` et `open:
 * true` pour tout le monde. Le jour où les réservations arriveront, l'état
 * s'affichera seul — barré, non cliquable, et nommant la prochaine heure libre
 * (vérifié le 2026-09-16).
 */
@Component({
  selector: 'app-slot-picker-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RovingRadioGroup,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
    CartBar,
  ],
  templateUrl: './slot-picker-dialog.html',
  styleUrl: './slot-picker-dialog.scss',
})
export class SlotPickerDialog {
  /** Le gabarit PARTAGÉ avec le sélecteur de maison — voir `order-dialog.ts`. */
  static readonly foldPanel: FoldPanelDefaults = ORDER_DIALOG;

  /**
   * Ouvre le sélecteur. Rend le créneau retenu, ou `undefined` si l'on ferme
   * sans choisir — fermer n'est pas choisir, et l'appelant doit pouvoir faire la
   * différence.
   */
  static open(
    panels: FoldPanelHostService,
    data: SlotPickerData,
  ): FoldPanelRef<SlotPickerResult | undefined> {
    return panels.open<SlotPickerData, SlotPickerResult | undefined>(SlotPickerDialog, {
      side: dialogSide(),
      data,
    });
  }

  readonly data = input.required<SlotPickerData>();

  private readonly slotsGateway = inject(PublicSlots);
  private readonly locale = inject(ClientLocale);
  private readonly ref = inject(FoldPanelRef);

  protected readonly c = screenCopy('slotPicker', slotPickerCopy);

  /** Le jour, tel que le panneau l'a pris. */
  protected readonly day = computed(() => this.data().day);

  protected readonly slots = signal<readonly PublicPickupSlot[]>([]);

  /**
   * La lecture est-elle en cours ?
   *
   * Sans ce drapeau, l'écran annoncerait « aucun créneau ce jour-là » pendant
   * qu'il charge — la même faute que l'accueil a déjà eue sur ses maisons, et
   * la pire des trois : une affirmation fausse.
   */
  protected readonly loading = signal(false);

  protected readonly picked = signal<PublicPickupSlot | null>(null);

  /** « Demain », « Aujourd'hui », ou la date — le jour comme un fait. */
  protected readonly dayLabel = computed(() => {
    const copy = this.c();
    return serviceDayLabel(this.day(), instantToLocal(new Date()).day, this.locale.current(), {
      today: copy.days.today,
      tomorrow: copy.days.tomorrow,
    });
  });

  /**
   * Les créneaux du jour, groupés par fournée.
   *
   * Les groupes suivent l'ORDRE des créneaux et ne se rassemblent que s'ils se
   * SUIVENT : deux plages distantes qui portent par hasard le même badge
   * restent deux groupes, parce qu'elles sont deux moments de la journée.
   */
  protected readonly batches = computed<readonly SlotBatch[]>(() => {
    const batches: { label: string | null; slots: PublicPickupSlot[] }[] = [];
    for (const slot of this.slots()) {
      const last = batches.at(-1);
      if (last !== undefined && last.label === slot.badge) {
        last.slots.push(slot);
      } else {
        batches.push({ label: slot.badge, slots: [slot] });
      }
    }
    return batches;
  });

  /** Le sur-titre : où l'on en est, et dans quelle maison. */
  protected readonly kicker = computed(() => fill(this.c().kicker, { place: this.data().place }));

  constructor() {
    // Le jour commande la lecture : les créneaux dépendent de l'heure qu'il
    // est, et en garder d'anciens proposerait une fournée déjà partie.
    effect(() => {
      const day = this.day();
      const point = this.data().pickupAddressId;
      this.loading.set(true);
      this.picked.set(null);
      void this.slotsGateway.forDay(point, day).then((slots) => {
        // Le jour a pu changer pendant l'attente : on ne pose que ce qui
        // répond à la question posée MAINTENANT.
        if (this.day() === day) {
          this.slots.set(slots);
          this.loading.set(false);
          // Le créneau déjà retenu revient présélectionné, s'il est encore ouvert.
          const kept = slots.find((slot) => this.isCurrent(slot) && slot.open);
          if (kept !== undefined) {
            this.picked.set(kept);
          }
        }
      });
    });
  }

  /** « Je change de date » : retour au panneau du jour, puis ici. */
  protected changeDay(): void {
    this.ref.close(CHANGE_DAY);
  }

  /**
   * Un clic sur une heure AVANCE (Hugo, 2026-10-27) : pas de bouton de
   * validation — se tromper d'heure se répare en un geste, et le seul geste
   * qui engage reste « Régler ». Un créneau complet ne se prend pas.
   */
  protected pick(slot: PublicPickupSlot): void {
    if (slot.open) {
      this.ref.close(slot);
    }
  }

  /** Est-ce le créneau déjà retenu ? Il porte le badge « Votre choix ». */
  protected isCurrent(slot: PublicPickupSlot): boolean {
    const current = this.data().current ?? null;
    return current !== null && current.day === this.day() && current.time === slot.time;
  }

  /** L'heure telle qu'elle se lit — « 6 h 30 ». */
  protected hourOf(slot: PublicPickupSlot): string {
    return formatHour(slot.time);
  }

  /** Ce que le créneau dit de lui-même, sous son heure. */
  protected stateOf(slot: PublicPickupSlot): string {
    const state = this.c().state;
    return slot.open ? state.open : state.full;
  }

  /**
   * Ce que dit un créneau complet : où il reste de la place, ou qu'il n'y en a
   * plus. Une absence serait un refus muet ; ceci est une orientation.
   */
  protected fullNote(slot: PublicPickupSlot): string {
    const copy = this.c().full;
    return slot.nextOpenTime === null
      ? copy.noNext
      : fill(copy.nextOpen, { time: formatHour(slot.nextOpenTime) });
  }
}
