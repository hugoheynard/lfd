import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { InHousePayerView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { longDay } from '../../comptabilite/collection-month-wording';
import { GestureIntents } from '../../shared/gesture-intents';
import { InHousePayerService } from './in-house-payer.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **« Restaurant maison »** — un de nos restaurants, enregistré comme client
 * (`comptabilite/facturation/plan-restaurants-maison.md`, D1–D3).
 *
 * L'état se lit avec la fiche ; le bouton n'apparaît qu'avec
 * `b2b_in_house_payers:write`. Le geste est immédiat et ne vaut que pour les
 * commandes passées ensuite : la confirmation le dit. Les refus (organisme
 * public, suivi de facturation entre deux natures) restent à l'écran avec
 * les mots du serveur.
 */
@Component({
  selector: 'app-in-house-payer-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './in-house-payer-card.html',
  styleUrl: './in-house-payer-card.scss',
})
export class InHousePayerCard {
  private readonly api = inject(InHousePayerService);
  private readonly permissions = inject(PermissionsStore);
  private readonly intents = new GestureIntents();

  readonly companyId = input.required<string>();

  protected readonly canWrite = computed(() => this.permissions.can('b2b_in_house_payers:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<InHousePayerView | null>(null);
  protected readonly confirming = signal(false);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly inHouse = computed(() => this.view()?.inHouse ?? false);
  protected readonly since = computed(() => {
    const at = this.view()?.declaredAt ?? null;
    return at === null ? null : longDay(at);
  });

  protected readonly confirmMessage = computed(() =>
    this.inHouse()
      ? 'Retirer la nature « restaurant maison » ? Les commandes passées à partir de maintenant seront de nouveau facturées ; celles déjà passées gardent leur régime.'
      : 'Marquer ce client comme un de nos restaurants ? Les commandes passées à partir de maintenant ne seront plus facturées ; celles déjà passées gardent leur régime.',
  );

  constructor() {
    effect(() => {
      const id = this.companyId();
      untracked(() => void this.load(id));
    });
  }

  protected async load(companyId: string = this.companyId()): Promise<void> {
    this.state.set('loading');
    try {
      this.view.set(await this.api.read(companyId));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Bascule l'état enregistré, une fois confirmé, sous la clé d'intention du sujet. */
  protected async apply(): Promise<void> {
    if (this.saving()) {
      return;
    }
    const id = this.companyId();
    const inHouse = !this.inHouse();
    const subject = `${id}:${String(inHouse)}`;
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.api.set(id, inHouse, this.intents.keyFor(subject));
      this.intents.done(subject);
      this.confirming.set(false);
      await this.load(id);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, '« Restaurant maison » n’a pas été enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }
}
