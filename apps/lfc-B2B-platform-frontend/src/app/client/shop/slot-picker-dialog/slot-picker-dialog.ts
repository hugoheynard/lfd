import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { addDays, instantToLocal, type PublicPickupSlot } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import { slotPickerCopy } from '../../copy/screens/slot-picker.copy';
import { formatHour } from '../../format-hour';
import { serviceDayLabel } from '../../format-day';
import { dialogSide } from '../../panel-side';
import { PublicSlots } from '../public-slots.gateway';

/** Combien de journées le visiteur peut regarder d'un coup. */
const DAYS_SHOWN = 3;

/** Ce qu'il faut pour ouvrir le sélecteur : la maison, et d'où partent les jours. */
export interface SlotPickerData {
  readonly pickupAddressId: string;
  /** Le nom d'usage de la maison — le sur-titre le rappelle. */
  readonly place: string;
  /**
   * La première journée offerte, **du serveur** (`GET /fulfillment-days`).
   *
   * 🔴 Jamais « demain » calculé ici : la journée demandable dépend de l'heure
   * limite du point, et ce dépôt a déjà corrigé un panier qui annonçait demain
   * là où le serveur servait le surlendemain. `null` = aucune journée ouverte,
   * et le dialogue le dit au lieu d'en inventer une.
   */
  readonly firstDay: string | null;
}

/** Un jour, tel que l'onglet le nomme. */
interface DayTab {
  readonly day: string;
  readonly label: string;
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
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './slot-picker-dialog.html',
  styleUrl: './slot-picker-dialog.scss',
})
export class SlotPickerDialog {
  /** `lg` : les créneaux d'une journée tiennent sur deux colonnes sans se serrer. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'lg', surface: 'solid' };

  /**
   * Ouvre le sélecteur. Rend le créneau retenu, ou `undefined` si l'on ferme
   * sans choisir — fermer n'est pas choisir, et l'appelant doit pouvoir faire la
   * différence.
   */
  static open(
    panels: FoldPanelHostService,
    data: SlotPickerData,
  ): FoldPanelRef<PublicPickupSlot | undefined> {
    return panels.open<SlotPickerData, PublicPickupSlot | undefined>(SlotPickerDialog, {
      side: dialogSide(),
      data,
    });
  }

  readonly data = input.required<SlotPickerData>();

  private readonly slotsGateway = inject(PublicSlots);
  private readonly locale = inject(ClientLocale);
  private readonly ref = inject(FoldPanelRef);

  protected readonly c = computed(() => slotPickerCopy(this.locale.current()));

  /** Le jour regardé. Vide tant que la première journée n'est pas connue. */
  protected readonly day = signal('');

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

  /**
   * Les trois journées offertes, à partir de celle que le serveur accorde.
   *
   * ⚠️ Le libellé (« demain ») se lit à l'horloge du navigateur, à Paris — c'est
   * un LIBELLÉ, pas une décision de service, et le panier fait déjà exactement
   * ça. Seul un onglet laissé ouvert passé minuit le décalerait d'un mot.
   */
  protected readonly days = computed<readonly DayTab[]>(() => {
    const first = this.data().firstDay;
    if (first === null) {
      return [];
    }
    const copy = this.c();
    const today = instantToLocal(new Date()).day;
    const locale = this.locale.current();
    return Array.from({ length: DAYS_SHOWN }, (_unused, index) => {
      const day = addDays(first, index);
      return {
        day,
        label: serviceDayLabel(day, today, locale, {
          today: copy.days.today,
          tomorrow: copy.days.tomorrow,
        }),
      };
    });
  });

  /** Le sur-titre : où l'on en est, et dans quelle maison. */
  protected readonly kicker = computed(() => fill(this.c().kicker, { place: this.data().place }));

  /** L'action NOMME l'heure — « Je prends 6 h 30 ». Sans choix, elle le demande. */
  protected readonly ctaLabel = computed(() => {
    const slot = this.picked();
    return slot === null ? this.c().ctaIdle : fill(this.c().cta, { time: formatHour(slot.time) });
  });

  constructor() {
    // La première journée ouvre le dialogue ; les suivantes s'atteignent par les
    // onglets. Rien n'est demandé tant que le serveur n'a accordé aucun jour.
    effect(() => {
      const first = this.data().firstDay;
      if (first !== null && this.day() === '') {
        this.day.set(first);
      }
    });

    // Le jour regardé commande la lecture. Chaque changement d'onglet relit :
    // les créneaux dépendent de l'heure qu'il est, et en garder d'anciens
    // proposerait une fournée déjà partie.
    effect(() => {
      const day = this.day();
      const point = this.data().pickupAddressId;
      if (day === '') {
        return;
      }
      this.loading.set(true);
      this.picked.set(null);
      void this.slotsGateway.forDay(point, day).then((slots) => {
        // Le jour a pu changer pendant l'attente : on ne pose que ce qui
        // répond à la question posée MAINTENANT.
        if (this.day() === day) {
          this.slots.set(slots);
          this.loading.set(false);
        }
      });
    });
  }

  protected showDay(day: string): void {
    this.day.set(day);
  }

  /** Un créneau complet ne se prend pas : le refus précède l'effort. */
  protected pick(slot: PublicPickupSlot): void {
    if (slot.open) {
      this.picked.set(slot);
    }
  }

  /** L'heure telle qu'elle se lit — « 6 h 30 ». */
  protected hourOf(slot: PublicPickupSlot): string {
    return formatHour(slot.time);
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

  /**
   * Repartir sans choisir. `undefined` et non le créneau survolé : fermer n'est
   * pas choisir, et l'appelant fait la différence sur cette valeur exacte.
   */
  protected back(): void {
    this.ref.close(undefined);
  }

  protected confirm(): void {
    const slot = this.picked();
    if (slot !== null) {
      this.ref.close(slot);
    }
  }
}
