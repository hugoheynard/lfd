import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrderHandoverView } from '@lfd/contracts';
import { formatOrderDate, formatOrderInstant } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent, FoldLoadingStateComponent } from 'fold-ng';

import { HandoverService } from '../handover.service';

/** Où en est l'écran : on charge, on a échoué, ou on tient une commande. */
type LoadState = 'loading' | 'ready' | 'error';

/**
 * **L'écran de comptoir.** Le client présente son QR, le staff le scanne avec
 * l'appareil photo natif de son téléphone, et cette page s'ouvre.
 *
 * Aucun lecteur de code-barres, aucune app à installer : un QR qui encode une
 * URL est déjà scannable par tous les téléphones du monde. C'est la seule raison
 * pour laquelle le jeton voyage dans une URL plutôt qu'en texte brut.
 *
 * La page est dessinée pour être lue **debout, à une main** : un titre, ce qu'il
 * y a dans le sac, un bouton. Tout ce qui relève de l'analyse (montants, TVA,
 * frise) vit sur la fiche commande, à un lien d'ici.
 */
@Component({
  selector: 'app-retrait-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldLoadingStateComponent, RouterLink],
  templateUrl: './retrait-page.html',
  styleUrl: './retrait-page.scss',
})
export class PickupPage {
  /** Le jeton, lié depuis le segment de route (c'est le QR qui l'apporte). */
  readonly token = input.required<string>();

  private readonly api = inject(HandoverService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string>('');
  protected readonly handover = signal<OrderHandoverView | null>(null);

  /** Une confirmation en cours — le bouton se désarme pour ne pas doubler. */
  protected readonly confirming = signal<boolean>(false);

  /**
   * `true` quand la remise vient d'être attestée **par ce poste**, à distinguer
   * d'une commande trouvée déjà remise : le premier cas mérite un accusé franc,
   * le second un simple constat. C'est la seule chose que l'écran sait et que le
   * serveur ne sait pas.
   */
  protected readonly justConfirmed = signal<boolean>(false);

  /** La remise est possible : on tient une commande, et rien ne la bloque. */
  protected readonly canConfirm = computed<boolean>(() => {
    const view = this.handover();
    return view !== null && view.blockedReason === null;
  });

  /** « Retirée le 12 août, 09:14 », ou `null` si elle ne l'a pas encore été. */
  protected readonly handedOverAt = computed<string | null>(() => {
    const at = this.handover()?.handedOverAt ?? null;
    return at === null ? null : formatOrderInstant(at);
  });

  constructor() {
    effect(() => {
      void this.load(this.token());
    });
  }

  protected async load(token: string = this.token()): Promise<void> {
    this.state.set('loading');
    this.justConfirmed.set(false);
    try {
      this.handover.set(await this.api.byToken(token));
      this.state.set('ready');
    } catch (error: unknown) {
      this.error.set(httpErrorMessage(error, 'Ce code de retrait est introuvable.'));
      this.state.set('error');
    }
  }

  /**
   * Atteste la remise. En cas de refus, on **remplace** la vue par ce que le
   * serveur renvoie plutôt que d'afficher seulement un message : si un autre
   * poste a gagné la course, l'écran doit montrer sa remise à lui, pas rester
   * sur un état devenu faux.
   */
  protected async confirm(): Promise<void> {
    if (this.confirming() || !this.canConfirm()) {
      return;
    }
    this.confirming.set(true);
    try {
      this.handover.set(await this.api.confirm(this.token()));
      this.justConfirmed.set(true);
    } catch (error: unknown) {
      this.error.set(httpErrorMessage(error, 'La remise n’a pas pu être enregistrée.'));
      await this.reload();
    } finally {
      this.confirming.set(false);
    }
  }

  /** Relit l'état sans effacer le message d'erreur qui vient de s'afficher. */
  private async reload(): Promise<void> {
    try {
      this.handover.set(await this.api.byToken(this.token()));
    } catch {
      this.state.set('error');
    }
  }

  protected fmtDate(iso: string): string {
    return formatOrderDate(iso);
  }
}
