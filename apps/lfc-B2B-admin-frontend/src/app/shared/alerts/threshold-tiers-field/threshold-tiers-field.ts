import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldButtonComponent, FoldInfoComponent, FoldNumberInputComponent } from 'fold-ng';
import type { AlertThresholdTier } from '@lfd/contracts';

/**
 * L'échelle des **paliers de seuil** : « jusqu'à N habituellement commandés,
 * alerter au-delà de X % d'écart ».
 *
 * Servie par les **deux** types qui comparent une quantité à une référence.
 * Seule la référence change — la moyenne du compte pour ce SKU, ou la norme du
 * produit tous comptes confondus — et c'est `baselineLabel` qui la nomme.
 *
 * Un pourcentage unique ne peut pas couvrir les deux bouts du catalogue : ×5 sur
 * un produit pris à l'unité n'est pas un incident, +30 % sur un produit pris par
 * 100 en est un. L'échelle rend ça **réglable et lisible**, au lieu de le cacher
 * dans une formule.
 *
 * Le **dernier palier est ouvert** (« au-delà ») et ne se supprime pas : sans lui,
 * une norme au-dessus du dernier seuil ne serait couverte par rien, et la règle
 * se tairait précisément sur les plus gros volumes.
 */
@Component({
  selector: 'app-threshold-tiers-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldNumberInputComponent, FoldButtonComponent, FoldInfoComponent],
  templateUrl: './threshold-tiers-field.html',
  styleUrl: './threshold-tiers-field.scss',
})
export class ThresholdTiersField {
  readonly tiers = input.required<readonly AlertThresholdTier[]>();
  /**
   * Comment s'appelle la référence sur laquelle le palier se choisit — « sa
   * moyenne pour ce produit » ou « la norme du produit ». L'éditeur est le même,
   * la référence ne l'est pas, et une échelle dont on ne sait pas de quoi elle
   * parle ne se règle pas.
   */
  readonly baselineLabel = input('la norme');
  /** « Hausse » / « Baisse » — deux échelles cohabitent sur le même écran. */
  readonly scaleLabel = input('Écart');
  /**
   * Le plafond du seuil. 99 pour une **baisse** : elle ne peut pas dépasser
   * 100 % et n'atteint même jamais ce plafond, donc laisser saisir 200 %
   * fabriquerait une surveillance qui ne se déclenche jamais.
   */
  readonly maxPercent = input(5000);
  readonly disabled = input(false);
  readonly tiersChange = output<AlertThresholdTier[]>();

  /** Le palier ouvert est le dernier : il n'a ni borne à saisir ni bouton retirer. */
  protected readonly bounded = computed(() => this.tiers().slice(0, -1));
  protected readonly open = computed(() => this.tiers()[this.tiers().length - 1] ?? null);

  protected setBound(index: number, value: number | null): void {
    this.emit(
      this.tiers().map((tier, i) =>
        i === index ? { ...tier, upToQuantity: Math.max(1, Math.trunc(value ?? 1)) } : tier,
      ),
    );
  }

  protected setPercent(index: number, value: number | null): void {
    this.emit(
      this.tiers().map((tier, i) =>
        i === index ? { ...tier, thresholdPercent: Math.max(5, Math.trunc(value ?? 5)) } : tier,
      ),
    );
  }

  /**
   * Ajoute un palier **avant** l'ouvert, une borne au-dessus du précédent : un
   * palier inséré au hasard casserait la croissance stricte que le serveur exige.
   */
  protected addTier(): void {
    const tiers = this.tiers();
    const previous = tiers[tiers.length - 2]?.upToQuantity ?? 0;
    // Borné : le schéma refuse au-delà d'un million, et un palier inséré
    // au-dessus produirait un 400 au moment d'enregistrer.
    const inserted: AlertThresholdTier = {
      upToQuantity: Math.min(1_000_000, previous + 10),
      thresholdPercent: this.open()?.thresholdPercent ?? 50,
    };
    this.emit([...tiers.slice(0, -1), inserted, ...tiers.slice(-1)]);
  }

  protected removeTier(index: number): void {
    this.emit(this.tiers().filter((_, i) => i !== index));
  }

  private emit(tiers: readonly AlertThresholdTier[]): void {
    this.tiersChange.emit(sorted(tiers));
  }
}

/**
 * Remet les paliers bornés dans l'ordre croissant, l'ouvert en queue. Saisir une
 * borne plus petite que la précédente est une correction en cours, pas une
 * erreur — on range plutôt que de refuser la frappe.
 */
function sorted(tiers: readonly AlertThresholdTier[]): AlertThresholdTier[] {
  const bounded = tiers
    .filter((tier) => tier.upToQuantity !== null)
    .sort((a, b) => (a.upToQuantity ?? 0) - (b.upToQuantity ?? 0));
  const open = tiers.find((tier) => tier.upToQuantity === null);
  return open === undefined ? bounded : [...bounded, open];
}
