import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CartAdjustment } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  type FoldSelectOption,
} from 'fold-ng';

import {
  formatAdjustmentValue,
  fromCartAdjustment,
  PriceAlterationField,
  toCartAdjustment,
  type PriceAlteration,
} from '@lfd/b2b-ui/pricing';

import { NotifyService } from '../../notify.service';
import { OrderLateFeeService } from './order-late-fee.service';
// Le référentiel n'est lu que pour PROPOSER des choix : ce qui s'enregistre est
// un pourcentage nu, jamais l'identifiant d'un taux. Le serveur B2B ne dépend
// donc de rien du PIM — la seule jonction entre les deux est cet écran, et elle
// se coupe en fermant l'onglet.
import { VatRateHttpApi } from '../../pim/catalogue/vat-rates/vat-http-api';
import type { VatRate } from '../../pim/data/models';

type LoadState = 'loading' | 'ready' | 'error';

/** « 5,5 % » — jamais « 5.5 % » : le séparateur anglais ne se voit pas soi-même. */
function percentLabel(percent: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(percent)} %`;
}

/**
 * Sous-page **Surtaxe de retard** des Réglages — ce qu'une dérogation coûte.
 *
 * ## Pourquoi elle n'est pas dans « Retraits & livraisons »
 *
 * Les deux autres ajustements de panier y vivent — la remise d'un point de
 * retrait, le frais d'une zone —, et il aurait été facile d'y poser le
 * troisième. Mais ces deux-là appartiennent à un OBJET d'acheminement : ils
 * sont là parce qu'un point et une zone y sont édités. La surtaxe
 * n'appartient à rien de tout ça ; c'est une politique de la maison.
 *
 * La rangeant là, on aurait refait exactement la faute que tout ce dossier
 * corrige : l'heure limite globale a vécu sous « Retraits & livraisons » et a
 * enseigné pendant des mois — sans jamais l'écrire — qu'elle était une affaire
 * d'acheminement. L'emplacement d'un écran est une affirmation sur le modèle.
 *
 * ## Pourquoi dans les Réglages et non dans l'espace B2B
 *
 * On ne va pas dans les Réglages pour travailler, on y va pour paramétrer une
 * fois. Le catalogue et la tarification B2B se reprennent tous les jours ; le
 * prix d'un rattrapage se décide une fois par an.
 *
 * ## Le taux n'a pas de défaut, et l'écran le dit
 *
 * `computeVatCents` **lève** quand une surtaxe arrive sans taux, au lieu de
 * retomber sur 20 % ou 5,5 % : une erreur bruyante coûte une commande, un
 * défaut plausible coûte toutes celles qu'on n'a pas regardées. Conséquence
 * ici : tant qu'un montant est posé sans taux, l'écran refuse d'enregistrer et
 * dit ce qui se passerait — il ne laisse pas découvrir la règle en production.
 */
@Component({
  selector: 'app-order-late-fee-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    PriceAlterationField,
  ],
  templateUrl: './order-late-fee-page.html',
  styleUrl: './order-late-fee-page.scss',
})
export class OrderLateFeePage {
  private readonly api = inject(OrderLateFeeService);
  private readonly vatRates = inject(VatRateHttpApi);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly saving = signal(false);
  protected readonly fee = signal<CartAdjustment | null>(null);
  protected readonly vatRatePercent = signal<number | null>(null);
  protected readonly rates = signal<readonly VatRate[]>([]);
  /** Les taux n'ont pas répondu : on garde l'écran, on retire la promesse. */
  protected readonly ratesUnavailable = signal(false);

  /**
   * Le montant vu comme une altération de prix. Le sens est **structurel** — une
   * surtaxe majore, toujours — donc il ne se stocke pas.
   */
  protected readonly feeAlteration = computed(() => fromCartAdjustment(this.fee(), 'increase'));

  /**
   * Les taux proposables, **dédupliqués par pourcentage** : c'est le
   * pourcentage qu'on enregistre, et deux taux qui valent 20 % sont le même
   * choix. Le taux réglé s'ajoute quand il ne correspond plus à rien —
   * l'omettre effacerait silencieusement un réglage en ouvrant l'écran.
   */
  protected readonly rateChoices = computed<FoldSelectOption<string>[]>(() => {
    const seen = new Set<number>();
    const choices: FoldSelectOption<string>[] = [];
    for (const rate of this.rates()) {
      if (seen.has(rate.percent)) {
        continue;
      }
      seen.add(rate.percent);
      choices.push({
        value: String(rate.percent),
        label: `${rate.name} — ${percentLabel(rate.percent)}`,
      });
    }
    const current = this.vatRatePercent();
    if (current !== null && !seen.has(current)) {
      choices.push({
        value: String(current),
        label: `${percentLabel(current)} — hors référentiel`,
      });
    }
    return choices;
  });

  protected readonly rateValue = computed(() => {
    const percent = this.vatRatePercent();
    return percent === null ? null : String(percent);
  });

  /** Le taux enregistré ne correspond plus à aucun taux du référentiel. */
  protected readonly orphanRate = computed(() => {
    const current = this.vatRatePercent();
    return (
      current !== null &&
      !this.ratesUnavailable() &&
      this.rates().length > 0 &&
      !this.rates().some((rate) => rate.percent === current)
    );
  });

  /** Un montant sans taux : le serveur lèverait au calcul, donc on n'envoie pas. */
  protected readonly missingRate = computed(
    () => this.fee() !== null && this.vatRatePercent() === null,
  );

  /** Ce qui s'appliquera, en une phrase — le récapitulatif qu'on relit avant de valider. */
  protected readonly recap = computed(() => {
    const fee = this.fee();
    if (fee === null) {
      return 'Une commande rattrapée après sa limite ne coûtera rien de plus.';
    }
    const amount =
      fee.mode === 'amount'
        ? `${formatAdjustmentValue(fee)} HT`
        : `${formatAdjustmentValue(fee)} du sous-total`;
    const percent = this.vatRatePercent();
    return percent === null
      ? `Une dérogation ajoutera ${amount} au panier — reste à choisir le taux.`
      : `Une dérogation ajoutera ${amount} au panier, taxés à ${percentLabel(percent)}.`;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    this.ratesUnavailable.set(false);
    try {
      const [setting, rates] = await Promise.all([
        this.api.read(),
        // Les taux ne sont qu'une liste de CHOIX : leur absence n'empêche pas
        // de lire ni de relire le réglage, donc elle ne fait pas tomber l'écran.
        this.vatRates.list().catch((): VatRate[] => {
          this.ratesUnavailable.set(true);
          return [];
        }),
      ]);
      this.rates.set(rates);
      this.fee.set(setting?.fee ?? null);
      this.vatRatePercent.set(setting?.vatRatePercent ?? null);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected setFee(alteration: PriceAlteration | null): void {
    this.fee.set(toCartAdjustment(alteration));
  }

  protected onRate(value: string): void {
    this.vatRatePercent.set(Number(value));
  }

  protected async submit(): Promise<void> {
    const fee = this.fee();
    const percent = this.vatRatePercent();
    if (this.saving() || this.missingRate()) {
      return;
    }
    this.saving.set(true);
    try {
      if (fee === null) {
        await this.api.clear();
        this.notify.success('Surtaxe retirée — le rattrapage est gratuit.');
      } else if (percent !== null) {
        await this.api.save({ fee, vatRatePercent: percent });
        this.notify.success('Surtaxe enregistrée.');
      }
      await this.load();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }
}
