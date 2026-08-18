import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { formatEuros } from '@lfd/catalog-ui';
import { FoldButtonComponent } from 'fold-ng';

import { Chart } from '../../../../shared/chart/chart';
import { ChartNote } from '../../../../shared/chart-note/chart-note';
import { nativeValue } from '../../../../shared/native-input';
import { revenueCurvesOption, revenueGapOption, type RevenueSeries } from '../revenue-chart';
import { centsOf, eurosField } from '../../grille/price-field';
import {
  averageUnitCents,
  curveOf,
  fixedScenario,
  gapCents,
  revenueCentsAt,
  unitPriceCentsAt,
  volumeSamples,
  type ArticleBasis,
  type Scenario,
  type ScenarioTier,
} from '../revenue-model';

/** Au-delà du volume promis : ce qu'on regarde, c'est le dépassement, pas le double. */
const OVERSHOOT = 1.3;
/** Deux scénarios gardés au plus — au troisième, on ne compare plus, on empile. */
const MAX_PINNED = 2;

/**
 * **Ce que la grille rapporte, selon le volume réellement commandé.**
 *
 * La question qu'on pose ici n'est pas « combien ça coûte » mais **« que se
 * passe-t-il s'il n'y va pas jusqu'au bout »** — et c'est une question de forme,
 * pas de chiffre : à quel moment le chiffre décroche, de combien, dans quel sens.
 *
 * Le prix fixe de référence ne se saisit pas, il se DÉDUIT de la grille et du
 * volume promis : deux offres qui ne tiennent pas la même promesse ne se
 * comparent pas. Reste à dire sur QUOI elles s'alignent — le prix annoncé au
 * client, ou le chiffre que nous encaissons — et les deux réponses ne racontent
 * pas la même négociation. Le choix est donc à l'écran, pas dans le code.
 */
@Component({
  selector: 'app-article-simulation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chart, ChartNote, FoldButtonComponent],
  templateUrl: './article-simulation.html',
  styleUrl: './article-simulation.scss',
})
export class ArticleSimulation {
  readonly name = input.required<string>();
  readonly catalogCents = input.required<number>();
  readonly floorCents = input.required<number | null>();
  /** Les paliers lisibles de la grille en cours de saisie. */
  readonly tiers = input.required<readonly ScenarioTier[]>();
  /**
   * Le volume prévu, **tenu par la grille** et non par ce bloc.
   *
   * C'est le même nombre qui alimente le partage en tête de page : deux champs
   * pour une seule quantité auraient fini par diverger, et le total de la
   * mercuriale aurait cessé de correspondre à ce que montrent les courbes.
   */
  readonly targetVolume = input.required<number>();
  /**
   * Une promotion franchit-elle le scellement ? La courbe ne la compte PAS —
   * composer une promotion demanderait la fonction qui facture, donc le serveur.
   * Une simulation qui annonce ce qu'elle ignore vaut mieux qu'une qui se croit
   * exacte à moitié.
   */
  readonly pierced = input(false);

  protected readonly euros = formatEuros;
  protected readonly nativeValue = nativeValue;

  /**
   * Le prix fixe comparé, **en chaîne et vide par défaut**.
   *
   * Vide = on retombe sur le prix moyen, la seule valeur qui fasse peser les deux
   * offres pareil. Une chaîne et non des centimes pour la raison habituelle : un
   * champ qu'on vide doit rester vide le temps de taper le nombre suivant.
   */
  protected readonly fixedField = signal('');
  protected readonly pinned = signal<readonly Scenario[]>([]);

  protected readonly basis = computed<ArticleBasis>(() => ({
    catalogCents: this.catalogCents(),
    floorCents: this.floorCents(),
  }));

  protected readonly live = computed<Scenario>(() => ({
    id: 'live',
    label: this.tiers().length > 1 ? `Paliers (${String(this.tiers().length)})` : 'Grille saisie',
    tiers: this.tiers(),
  }));

  /**
   * **Les deux prix remarquables**, proposés et jamais imposés.
   *
   * Ils bornent la discussion : au prix annoncé, le barème rapporte plus partout ;
   * au prix moyen, les deux offres pèsent le même chiffre au volume promis. Entre
   * les deux — et au-delà — c'est au commercial de poser SON alternative.
   */
  protected readonly anchors = computed(() => ({
    headlineCents: unitPriceCentsAt(this.live(), this.basis(), this.targetVolume()),
    averageCents: averageUnitCents(this.live(), this.basis(), this.targetVolume()),
  }));

  /** Le prix fixe comparé : celui saisi, à défaut le prix moyen. */
  protected readonly referenceCents = computed(() => {
    const anchors = this.anchors();
    return centsOf(this.fixedField()) ?? anchors.averageCents ?? anchors.headlineCents;
  });

  // Le prix est DANS la légende : « prix fixe » sans son montant oblige à
  // remonter au champ pour savoir contre quoi la courbe se compare.
  protected readonly reference = computed(() => {
    const scenario = fixedScenario(this.referenceCents(), this.basis());
    return { ...scenario, label: `Fixe ${formatEuros(scenario.tiers[0]?.unitPriceCents ?? 0)}` };
  });

  protected readonly canPin = computed(
    () => this.tiers().length > 1 && this.pinned().length < MAX_PINNED,
  );

  private readonly scenarios = computed<readonly Scenario[]>(() => [
    this.reference(),
    this.live(),
    ...this.pinned(),
  ]);

  protected readonly series = computed<readonly RevenueSeries[]>(() => {
    const max = Math.max(2, Math.round(this.targetVolume() * OVERSHOOT));
    const volumes = volumeSamples(this.scenarios(), this.targetVolume(), max);
    return this.scenarios().map((scenario, index) => ({
      id: scenario.id,
      label: scenario.label,
      tone: index + 1,
      points: curveOf(scenario, this.basis(), volumes),
    }));
  });

  protected readonly curvesOption = computed(() =>
    revenueCurvesOption(this.series(), this.targetVolume()),
  );

  /**
   * **L'écart au prix fixe**, tracé à part.
   *
   * Séparé et non superposé : deux courbes de chiffre presque parallèles ne
   * laissent pas voir un écart de quelques pour cent, et c'est cet écart qui
   * porte toute la question. Avec son propre zéro, il se lit d'un coup — au-dessus,
   * le barème a sécurisé ; en dessous, il nous coûte.
   */
  protected readonly gapOption = computed(() => {
    const [reference, live] = [this.series()[0], this.series()[1]];
    if (reference === undefined || live === undefined) {
      return null;
    }
    return revenueGapOption(gapCents(live.points, reference.points), this.targetVolume(), 1);
  });

  /**
   * **Ce qu'une sortie anticipée laisse dans la caisse.**
   *
   * Trois fractions du volume promis, et l'écart au prix fixe à chacune. C'est la
   * lecture chiffrée de la bosse — un graphique montre qu'il y a un écart, il ne
   * dit pas combien, et c'est le combien qui s'écrit dans un contrat.
   */
  protected readonly exits = computed(() =>
    [0.25, 0.5, 0.75].map((share) => {
      const volume = Math.max(1, Math.round(this.targetVolume() * share));
      const deltaCents =
        revenueCentsAt(this.live(), this.basis(), volume) -
        revenueCentsAt(this.reference(), this.basis(), volume);
      return { share: Math.round(share * 100), volume, deltaCents };
    }),
  );

  /** Reprendre un prix remarquable : il ATTERRIT dans le champ, il ne le verrouille pas. */
  protected useAnchor(cents: number | null): void {
    if (cents !== null) {
      this.fixedField.set(eurosField(cents));
    }
  }

  /** Le prix fixe réellement tracé — la limite peut l'avoir relevé. */
  protected readonly appliedFixedCents = computed(
    () => this.reference().tiers[0]?.unitPriceCents ?? 0,
  );

  /**
   * Garder la grille telle quelle, pour en essayer une autre.
   *
   * Le scénario gardé est une COPIE : continuer à taper dans la grille ne le
   * déforme pas, sinon les deux courbes bougeraient ensemble et il n'y aurait
   * plus rien à comparer.
   */
  protected pin(): void {
    if (!this.canPin()) {
      return;
    }
    this.pinned.update((kept) => [
      ...kept,
      {
        id: `garde-${String(kept.length + 1)}`,
        label: `Gardé · ${String(this.tiers().length)} paliers`,
        tiers: this.tiers().map((tier) => ({ ...tier })),
      },
    ]);
  }

  protected drop(id: string): void {
    this.pinned.update((kept) => kept.filter((scenario) => scenario.id !== id));
  }
}
