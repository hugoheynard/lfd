import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type { WorkstationProductStationView, WorkstationView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldFieldsetComponent,
  FoldListboxComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldSelectOption,
} from 'fold-ng';

import { GestureIntents, shownOnce } from '../../../shared/gesture-intents';
import { WorkstationsService } from '../../workstations.service';

/** Ce que le dialogue règle : les postes d'un produit, et celui qui le finit. */
export interface ProductStationsDialogData {
  readonly productSku: string;
  readonly productName: string;
  /** Ses postes servis, celui qui finit en premier. */
  readonly stations: readonly WorkstationProductStationView[];
  /** Les postes en service, dans l'ordre des fiches. */
  readonly workstations: readonly WorkstationView[];
}

/** Ce que les gestes du dialogue demandent à la carte des postes. */
export type StationMapApi = Pick<
  WorkstationsService,
  'place' | 'addToProducts' | 'removeFromProducts' | 'setFinishing'
>;

/** Un geste vers la carte des postes, et le sujet de son intention. */
export interface StationGesture {
  readonly subject: string;
  readonly send: (api: StationMapApi, intentKey: string) => Promise<void>;
}

/**
 * Les gestes qui mènent des postes servis à ceux choisis, dans l'ordre que
 * la carte accepte (`un-produit-sur-plusieurs-postes.md`, § 2.1) :
 *
 * 1. aucun poste choisi : le produit retourne « à ranger » (`place` à `null`) ;
 * 2. sinon, les postes ajoutés — celui qui finit d'abord quand le produit
 *    n'en avait aucun, puisque le premier poste finit ;
 * 3. le poste qui finit, s'il change ;
 * 4. les postes retirés — après la bascule, car retirer celui qui finit
 *    pendant qu'il en reste d'autres est refusé.
 */
export function stationGestures(
  sku: string,
  before: readonly WorkstationProductStationView[],
  chosen: readonly string[],
  finisher: string | null,
): readonly StationGesture[] {
  const had = new Set(before.map((station) => station.workstationId));
  const wants = new Set(chosen);
  if (wants.size === 0) {
    return had.size === 0
      ? []
      : [
          {
            subject: `place:${sku}:`,
            send: (api, key) => api.place({ productSkus: [sku], workstationId: null }, key),
          },
        ];
  }
  const finishing = finisher !== null && wants.has(finisher) ? finisher : null;
  const added = chosen.filter((id) => !had.has(id));
  if (had.size === 0 && finishing !== null) {
    added.sort((left, right) => Number(right === finishing) - Number(left === finishing));
  }
  const firstFinisher = had.size === 0 ? (added[0] ?? null) : null;
  const wasFinishing = before.find((station) => station.finishes)?.workstationId ?? firstFinisher;
  const gestures: StationGesture[] = added.map((id) => ({
    subject: `add:${sku}:${id}`,
    send: (api, key) => api.addToProducts(id, [sku], key),
  }));
  if (finishing !== null && finishing !== wasFinishing) {
    gestures.push({
      subject: `finish:${sku}:${finishing}`,
      send: (api, key) => api.setFinishing(finishing, sku, key),
    });
  }
  for (const station of before) {
    const id = station.workstationId;
    if (!wants.has(id)) {
      gestures.push({
        subject: `remove:${sku}:${id}`,
        send: (api, key) => api.removeFromProducts(id, [sku], key),
      });
    }
  }
  return gestures;
}

/**
 * **Les postes d'un produit** (`fournil/un-produit-sur-plusieurs-postes.md`,
 * § 2.9) : une case par poste, et le choix de celui qui finit — seul son
 * « Fait » compte des pièces ; les autres cochent une étape. Une feuille du
 * bas au téléphone, un dialogue centré au bureau.
 *
 * Il écrit lui-même, geste par geste, chacun sous sa clé d'intention : un
 * refus s'arrête là et le dit sur place ; un geste déjà abouti rejoué au
 * nouvel essai ne change rien à la carte. Fermé, il rend `true` si la carte
 * a changé, même quand la suite a été refusée.
 */
@Component({
  selector: 'app-product-stations-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldFieldsetComponent,
    FoldListboxComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './product-stations-dialog.html',
  styleUrl: './product-stations-dialog.scss',
})
export class ProductStationsDialog {
  private readonly api = inject(WorkstationsService);
  private readonly ref = inject<FoldPanelRef<boolean>>(FoldPanelRef);
  private readonly intents = new GestureIntents();

  readonly data = input.required<ProductStationsDialogData>();

  protected readonly chosen = linkedSignal(() =>
    this.data().stations.map((station) => station.workstationId),
  );
  protected readonly finisher = linkedSignal<string | null>(
    () => this.data().stations.find((station) => station.finishes)?.workstationId ?? null,
  );
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  /** Un geste a abouti : la carte a changé, même si la suite a été refusée. */
  private changed = false;

  /** Le poste qui finit se choisit parmi les postes cochés. */
  protected readonly finisherOptions = computed<readonly FoldSelectOption<string>[]>(() => {
    const chosen = new Set(this.chosen());
    return this.data()
      .workstations.filter((station) => chosen.has(station.id))
      .map((station) => ({ value: station.id, label: station.name }));
  });

  /** Le poste qui finit, ramené au premier coché quand le sien a été décoché. */
  protected readonly finishing = computed(() => {
    const options = this.finisherOptions();
    const wanted = this.finisher();
    return options.some((option) => option.value === wanted) ? wanted : (options[0]?.value ?? null);
  });

  protected readonly gestures = computed(() =>
    stationGestures(this.data().productSku, this.data().stations, this.chosen(), this.finishing()),
  );

  protected isChosen(id: string): boolean {
    return this.chosen().includes(id);
  }

  protected toggle(id: string, on: boolean): void {
    this.chosen.update((ids) => (on ? [...ids, id] : ids.filter((known) => known !== id)));
  }

  protected async submit(): Promise<void> {
    if (this.saving() || this.gestures().length === 0) {
      return;
    }
    this.saving.set(true);
    this.failure.set(null);
    try {
      for (const gesture of this.gestures()) {
        await shownOnce(this.intents, gesture.subject, (key) => gesture.send(this.api, key));
        this.changed = true;
      }
      this.ref.close(true);
    } catch (error) {
      this.failure.set(httpErrorMessage(error, 'Les postes n’ont pas pu être enregistrés.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close(this.changed ? true : undefined);
  }
}
