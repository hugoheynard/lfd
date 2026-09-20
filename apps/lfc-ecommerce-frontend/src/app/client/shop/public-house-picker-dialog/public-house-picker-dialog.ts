import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { PickupAddressView } from '@lfd/contracts';
import {
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientAudience } from '../../client-audience.service';
import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { housePickerCopy } from '../../copy/screens/house-picker.copy';
import { dialogSide } from '../../panel-side';
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
  readonly current: boolean;
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
  imports: [FoldPanelBodyComponent, FoldPanelHeaderComponent],
  templateUrl: './public-house-picker-dialog.html',
  styleUrl: './public-house-picker-dialog.scss',
})
export class PublicHousePickerDialog {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

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
    return this.points.pickups().map((point) => ({
      point,
      // Le nom d'usage, sa ville à défaut — une carte sans titre ne se distingue pas.
      name: point.label || point.ville,
      place: `${point.ville} · ${point.ligne1}`,
      offer: pickupOffer(point, audience, copy),
      current: point.id === currentId,
    }));
  });

  protected pick(house: House): void {
    this.ref.close(house.point);
  }
}
