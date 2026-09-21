import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { PickupAddressView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientAudience } from '../../client-audience.service';
import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { housePickerCopy } from '../../copy/screens/house-picker.copy';
import { formatHour } from '../../format-hour';
import { dialogSide } from '../../panel-side';
import { ORDER_DIALOG } from '../order-dialog';
import { pickupOffer } from '../pickup-discount';
import { ServicePoints } from '../pickup-points.store';

/** Ce qu'il faut pour ouvrir le sélecteur : la maison déjà retenue, s'il y en a une. */
export interface HousePickerData {
  readonly currentId: string | null;
}

/** Une maison, telle que la liste l'affiche. */
interface House {
  readonly point: PickupAddressView;
  readonly name: string;
  readonly place: string;
  readonly offer: { readonly label: string; readonly hasOffer: boolean };
  /**
   * La maison d'où l'on VIENT — celle que le dialogue a reçue en entrant.
   *
   * ⚠️ Distincte de {@link selected}, et il faut les deux : la pastille
   * « Votre choix » nomme ce qui est DÉJÀ acquis, le cercle montre ce qu'on
   * s'apprête à prendre. Les confondre ferait dire « votre choix » à une
   * maison qu'on n'a pas encore confirmée.
   */
  readonly current: boolean;
  /** Ce que le cercle montre : la sélection en cours, ou le choix d'entrée. */
  readonly selected: boolean;
  /**
   * « Prêt dès 6 h 30 », ou VIDE.
   *
   * ⚠️ Vide quand le point ne reçoit pas de public (`publicOpening: null`) :
   * afficher une heure prise ailleurs — le créneau PRO, par exemple — ferait
   * venir quelqu'un devant une porte qui ne lui est pas ouverte. La maquette
   * met sur cette ligne un temps d'accès (« 4 min à pied du téléphérique ») que
   * rien dans le système ne porte ; il n'y est pas.
   */
  readonly ready: string;
}

/**
 * **« Où je la prends ? »** — l'étape 1, rouverte depuis la boutique.
 *
 * 🔴 Un DIALOGUE et non un retour à l'accueil : le panier est composé, et
 * quitter le rayon pour changer de maison ferait perdre le rayon de vue. La
 * même règle que l'heure, qui se change déjà sans partir.
 *
 * ⚠️ Changer de maison **périme l'heure** : les créneaux sont ceux d'un point,
 * et une heure retenue au Labo n'existe pas forcément au Village. L'appelant
 * enchaîne donc sur le sélecteur d'heure — ce dialogue-ci ne rend que le point,
 * il ne décide pas de la suite.
 *
 * La pastille d'offre vient de `pickupOffer`, lecteur unique de ce que promet
 * un point : la carte et le dialogue se sont déjà contredits sur un pourcentage
 * pour avoir calculé chacun le sien (corrigé le 2026-09-15).
 */
@Component({
  selector: 'app-public-house-picker-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './public-house-picker-dialog.html',
  styleUrl: './public-house-picker-dialog.scss',
})
export class PublicHousePickerDialog {
  static readonly foldPanel: FoldPanelDefaults = ORDER_DIALOG;

  /**
   * Ouvre le sélecteur. Rend le point retenu, ou `undefined` si l'on ferme sans
   * choisir — fermer n'est pas choisir, et l'appelant doit faire la différence
   * avant de périmer l'heure déjà prise.
   */
  static open(
    panels: FoldPanelHostService,
    data: HousePickerData,
  ): FoldPanelRef<PickupAddressView | undefined> {
    return panels.open<HousePickerData, PickupAddressView | undefined>(PublicHousePickerDialog, {
      side: dialogSide(),
      stack: true,
      data,
    });
  }

  readonly data = input.required<HousePickerData>();

  private readonly points = inject(ServicePoints);
  private readonly locale = inject(ClientLocale);
  private readonly t = inject(ClientCopyService).t;
  private readonly ref = inject(FoldPanelRef);

  /** Un visiteur est `b2c` — et le défaut penche de ce côté tant qu'on ne sait pas. */
  private readonly audience = inject(ClientAudience).shown;

  protected readonly c = computed(() => housePickerCopy(this.locale.current()));

  constructor() {
    // Idempotent : la boutique les a souvent déjà lus.
    void this.points.hydrate();
  }

  protected readonly houses = computed<readonly House[]>(() => {
    const audience = this.audience();
    const copy = this.t().pickupDialog;
    const currentId = this.data().currentId;
    const selectedId = this.picked() ?? currentId;
    return this.points.pickups().map((point) => ({
      point,
      // Le nom d'usage, sa ville à défaut — une carte sans titre ne se distingue pas.
      name: point.label || point.ville,
      place: `${point.ville} · ${point.ligne1}`,
      offer: pickupOffer(point, audience, copy),
      current: point.id === currentId,
      selected: point.id === selectedId,
      ready: readyLabel(point, this.c().readyFrom),
    }));
  });

  /**
   * La maison retenue — celle d'où l'on vient, tant qu'on n'a rien touché.
   *
   * 🔴 SÉLECTIONNER N'EST PLUS CONFIRMER (Hugo, 2026-09-20 : « on met un footer
   * avec un bouton choisir mon heure »). Le clic fermait tout et enchaînait sur
   * l'heure : on ne pouvait pas comparer deux maisons — la première touchée
   * était la bonne — et le geste n'avait pas de retour en arrière, alors que le
   * volet suivant en a un.
   */
  protected readonly picked = signal<string | null>(null);

  protected readonly chosen = computed(() => this.houses().find((house) => house.selected) ?? null);

  protected readonly ctaLabel = computed(() =>
    this.chosen() === null ? this.c().ctaIdle : this.c().cta,
  );

  protected pick(house: House): void {
    this.picked.set(house.point.id);
  }

  protected confirm(): void {
    const house = this.chosen();
    if (house !== null) {
      this.ref.close(house.point);
    }
  }
}

/** « Prêt dès 6 h 30 » — ou rien, faute d'ouverture publique déclarée. */
function readyLabel(point: PickupAddressView, gabarit: string): string {
  // `null` ET `undefined` : la fenêtre peut manquer, et sa borne aussi. Les deux
  // veulent dire la même chose ici — on ne sait pas, donc on ne dit rien.
  const start = point.opening.publicOpening?.start ?? null;
  return start === null ? '' : fill(gabarit, { hour: formatHour(start) });
}
