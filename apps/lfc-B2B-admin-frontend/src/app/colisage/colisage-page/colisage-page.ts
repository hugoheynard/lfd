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
import type { OrderPackingView } from '@lfd/contracts';
import { formatOrderDate, formatOrderInstant } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent, FoldLoadingStateComponent } from 'fold-ng';

import { PackingService } from '../packing.service';

/** Où en est l'écran : on charge, on a échoué, ou on tient une commande. */
type LoadState = 'loading' | 'ready' | 'error';

/**
 * **L'écran du fournil.** On scanne le QR d'une fiche avec l'appareil photo du
 * téléphone, cette page s'ouvre, un bouton déclare la commande prête.
 *
 * Dessiné pour être lu **debout, à une main, entre deux fournées** : le client,
 * ce qu'il y a dans le bac, un bouton. Rien d'autre — surtout pas un montant,
 * qui n'a jamais aidé personne au four.
 *
 * Jumeau de l'écran de comptoir, et volontairement : les deux gestes se
 * ressemblent, et deux dessins différents pour deux scans obligeraient à
 * apprendre deux fois.
 */
@Component({
  selector: 'app-colisage-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldLoadingStateComponent, RouterLink],
  templateUrl: './colisage-page.html',
  styleUrl: './colisage-page.scss',
})
export class ColisagePage {
  /** Le numéro, lié depuis le segment de route (c'est le QR qui l'apporte). */
  readonly reference = input.required<string>();

  private readonly api = inject(PackingService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string>('');
  protected readonly packing = signal<OrderPackingView | null>(null);

  /** Une déclaration en cours — le bouton se désarme pour ne pas doubler. */
  protected readonly marking = signal<boolean>(false);

  /**
   * `true` quand la commande vient d'être déclarée prête **par ce poste**, à
   * distinguer d'une commande trouvée déjà prête : le premier cas mérite un
   * accusé franc, le second un simple constat. C'est la seule chose que l'écran
   * sait et que le serveur ne sait pas.
   */
  protected readonly justMarked = signal<boolean>(false);

  /** Déclarable : on tient une commande, et rien ne la bloque. */
  protected readonly canMark = computed<boolean>(() => {
    const view = this.packing();
    return view !== null && view.blockedReason === null;
  });

  /** « Prête le 7 sept., 04:12 », ou `null` si elle ne l'est pas encore. */
  protected readonly readyAt = computed<string | null>(() => {
    const at = this.packing()?.readyAt ?? null;
    return at === null ? null : formatOrderInstant(at);
  });

  constructor() {
    effect(() => {
      void this.load(this.reference());
    });
  }

  protected async load(reference: string = this.reference()): Promise<void> {
    this.state.set('loading');
    this.justMarked.set(false);
    try {
      this.packing.set(await this.api.byReference(reference));
      this.state.set('ready');
    } catch (error: unknown) {
      this.error.set(httpErrorMessage(error, 'Cette fiche est peut-être d’un autre jour.'));
      this.state.set('error');
    }
  }

  /**
   * Déclare la commande prête. En cas de refus, on **remplace** la vue par ce que
   * le serveur renvoie plutôt que d'afficher seulement un message : si un autre
   * poste a gagné la course, l'écran doit montrer son colisage à lui, pas rester
   * sur un état devenu faux. Deux mains sur la même fiche est le cas normal.
   */
  protected async markReady(): Promise<void> {
    if (this.marking() || !this.canMark()) {
      return;
    }
    this.marking.set(true);
    try {
      this.packing.set(await this.api.markReady(this.reference()));
      this.justMarked.set(true);
    } catch (error: unknown) {
      this.error.set(httpErrorMessage(error, 'Le colisage n’a pas pu être enregistré.'));
      await this.reload();
    } finally {
      this.marking.set(false);
    }
  }

  /** Relit l'état sans effacer le message d'erreur qui vient de s'afficher. */
  private async reload(): Promise<void> {
    try {
      this.packing.set(await this.api.byReference(this.reference()));
    } catch {
      this.state.set('error');
    }
  }

  protected fmtDate(iso: string): string {
    return formatOrderDate(iso);
  }
}
