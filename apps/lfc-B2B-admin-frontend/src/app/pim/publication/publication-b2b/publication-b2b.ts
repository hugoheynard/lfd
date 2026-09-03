import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import {
  B2bChannelApi,
  type B2bExclusionReason,
  type B2bPushPreviewView,
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

/** Ce que l'envoi ferait à un article, dit à qui regarde. */
const CHANGES: Readonly<Record<string, string>> = {
  added: 'entre',
  changed: 'change',
  unchanged: 'inchangé',
};

/**
 * Publication vers la **boutique B2B** — la plateforme qui encaisse.
 *
 * ## L'aperçu se calcule à l'ouverture, il ne se demande plus
 *
 * Il y avait un bouton « Simuler », et il fallait le cliquer avant de pouvoir
 * envoyer quoi que ce soit. Ce n'était pas un choix offert : cent pour cent des
 * visites commençaient par ce clic, puisqu'on ne décide pas d'envoyer sans voir
 * ce qui partirait.
 *
 * Il existait pour une raison technique, pas pour une raison d'usage : simuler
 * appelait `push({dryRun:true})`, qui traverse la tuyauterie d'envoi et **pose
 * une ancre de révision**. On ne déclenche pas des écritures au chargement d'une
 * page — d'où le bouton, et d'où des ancres qui s'accumulaient à chaque regard.
 *
 * L'aperçu est maintenant une lecture (`GET admin/catalog/push-preview`). Il
 * n'écrit rien, donc l'écran le charge en s'ouvrant.
 *
 * ## Et il voit enfin les retraits
 *
 * La simulation ne les voyait pas — le pilote à blanc l'avouait : seul
 * `removedSkus` restait vide, parce que lui seul suppose de connaître l'état de
 * l'autre côté. L'aperçu confronte la projection au miroir : ce qui entre, ce
 * qui change, ce qui **sort de la vente**.
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
    FoldLoadingStateComponent,
  ],
  templateUrl: './publication-b2b.html',
  styleUrl: './publication-b2b.scss',
})
export class PublicationB2b {
  private readonly api = inject(B2bChannelApi);

  protected readonly preview = signal<B2bPushPreviewView | null>(null);
  protected readonly sent = signal<B2bPushSummaryView | null>(null);
  protected readonly busy = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly excluded = computed(() =>
    (this.preview()?.excluded ?? []).map((item) => ({
      sku: item.sku,
      // Le motif voyage en chaîne — son vocabulaire appartient au référentiel,
      // et le contrat de la plateforme ne l'importe pas. Un motif inconnu se
      // montre tel quel plutôt que de disparaître.
      label: REASONS[item.reason as B2bExclusionReason] ?? item.reason,
    })),
  );

  /** Ce qui bouge vraiment — l'inchangé est le gros du catalogue, et il attend. */
  protected readonly moving = computed(() =>
    (this.preview()?.outgoing ?? []).filter((item) => item.change !== 'unchanged'),
  );

  protected readonly unchangedCount = computed(
    () => (this.preview()?.outgoing.length ?? 0) - this.moving().length,
  );

  /**
   * Rien ne bouge : ni entrée, ni changement, ni retrait.
   *
   * `parity.inSync` répondrait presque, mais pas tout à fait — il compte aussi
   * les écarts de nom, qu'un envoi corrige au même titre. On lit donc ce qu'on
   * affiche, plutôt qu'un booléen calculé sur un périmètre voisin.
   */
  protected readonly settled = computed(
    () => this.moving().length === 0 && (this.preview()?.removed.length ?? 0) === 0,
  );

  constructor() {
    void this.load();
  }

  protected changeLabel(change: string): string {
    return CHANGES[change] ?? change;
  }

  protected euros(millicents: number): string {
    return (millicents / 100_000).toFixed(2);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.preview.set(await this.api.preview());
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Aperçu impossible à lire.'));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Envoie ce qui est à l'écran — et rien d'autre.
   *
   * L'empreinte de l'aperçu accompagne l'envoi : si le catalogue a bougé depuis
   * l'ouverture, le serveur refuse en `409` plutôt que d'expédier autre chose
   * que ce qui a été relu. Le geste de sortie est de recharger, et c'est ce que
   * fait le rechargement en fin de méthode — y compris après un refus.
   */
  protected async send(): Promise<void> {
    const fingerprint = this.preview()?.fingerprint;
    if (fingerprint === undefined) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      this.sent.set(await this.api.push(false, fingerprint));
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Envoi impossible.'));
    } finally {
      this.busy.set(false);
      // Après un envoi comme après un refus, ce qui est à l'écran est périmé :
      // le canal a changé, ou le catalogue avait déjà changé. Le relire est la
      // seule façon d'en sortir.
      await this.load();
    }
  }
}
