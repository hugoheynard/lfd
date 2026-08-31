import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
} from 'fold-ng';

import {
  B2bChannelApi,
  type B2bExclusionReason,
  type B2bPushSummaryView,
} from '../../channels/b2b-channel-api';

/** Le motif d'exclusion, dit en français plutôt qu'en clé technique. */
const REASONS: Readonly<Record<B2bExclusionReason, string>> = {
  variant_sans_prix: 'pas de tarif',
  variant_arretee: 'déclinaison arrêtée',
  produit_sans_variante_vendable: 'aucune déclinaison vendable',
  famille_inconnue: 'famille absente du référentiel',
  canal_ferme: 'non vendue aux professionnels',
  // « le prix existe, le taux manque » : c'est l'écran des taux qu'il faut
  // ouvrir, pas celui du tarif. Le dire évite d'aller corriger au mauvais
  // endroit.
  variant_sans_taux: 'prix sans taux B2B',
};

/**
 * Publication vers la **boutique B2B** — la plateforme qui encaisse.
 *
 * Cet onglet manquait, et son absence coûtait cher : le canal savait pousser
 * côté serveur, mais rien dans le back-office ne l'appelait. Un taux de TVA
 * révisé, un prix corrigé, un produit publié n'atteignaient donc jamais la
 * boutique — qui continuait de vendre l'état du dernier push, sans que rien ne
 * le dise.
 *
 * On **simule** d'abord (par défaut), on lit ce qui partirait et ce qui serait
 * écarté, puis on envoie. Le mode rendu par le serveur est réaffiché à chaque
 * fois : sans ça on croit pousser pour de vrai.
 */
@Component({
  selector: 'app-publication-b2b',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
  ],
  templateUrl: './publication-b2b.html',
  styleUrl: './publication-b2b.scss',
})
export class PublicationB2b {
  private readonly api = inject(B2bChannelApi);

  protected readonly summary = signal<B2bPushSummaryView | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Vrai une fois qu'une simulation a été lue — l'envoi réel s'y adosse. */
  protected readonly simulated = signal(false);

  protected readonly excluded = computed(() =>
    (this.summary()?.excluded ?? []).map((item) => ({
      sku: item.sku,
      label: REASONS[item.reason],
    })),
  );

  protected simulate(): Promise<void> {
    return this.run(true);
  }

  protected send(): Promise<void> {
    return this.run(false);
  }

  private async run(dryRun: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const summary = await this.api.push(dryRun);
      this.summary.set(summary);
      // Seule une simulation RÉELLEMENT rendue en dry-run arme l'envoi : le
      // serveur peut répondre `live` à une demande de simulation si les
      // réglages l'imposent, et on ne veut pas armer sur ce malentendu.
      this.simulated.set(summary.mode === 'dry-run');
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : 'Envoi impossible.');
    } finally {
      this.busy.set(false);
    }
  }
}
