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
import { SEPA_SCHEME_LABELS, type MandateSchemeUsageView, type SepaScheme } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { LegalEntitiesService } from '../../../legal-entities.service';

/** Ce que la carte demande de confirmer : l'entité, et la bascule envisagée. */
export interface MandateSchemeDialogData {
  readonly entityId: string;
  readonly from: SepaScheme;
  readonly to: SepaScheme;
}

type Stage = 'loading' | 'failed' | 'ready';

/**
 * Ce que le schéma CHOISI fait au débiteur — la seule phrase qui change d'une
 * bascule à l'autre.
 *
 * 🔴 En CORE, rien sur la déclaration à la banque : elle n'existe qu'en
 * interentreprises, et la dire ici ferait réclamer au client une démarche que
 * sa banque ne connaît pas.
 */
const CONSEQUENCE: Readonly<Record<SepaScheme, string>> = {
  CORE: 'Le débiteur pourra se faire rembourser un prélèvement pendant 8 semaines après son débit, sans avoir à se justifier.',
  B2B: "Le débiteur ne pourra obtenir aucun remboursement d'un prélèvement autorisé, et chaque client devra déclarer son mandat à sa banque avant le premier prélèvement — sans quoi elle le rejette.",
};

/** « 1 brouillon », « 3 brouillons » — le nombre commande l'accord. */
function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * **Confirmer un changement de schéma de mandat.**
 *
 * Changer de schéma ne se fait pas d'un clic dans une liste : c'est ce qui
 * décide si un débiteur peut contester un prélèvement pendant huit semaines, et
 * s'il doit passer par sa banque. Le dialogue nomme donc la conséquence, et
 * la chiffre en relisant `GET …/mandate-scheme` à l'ouverture :
 *
 * - les **brouillons** de l'entité deviennent caducs — leur papier porte
 *   l'ancien schéma, et c'est ce papier-là qu'on aurait activé ;
 * - les **mandats actifs** gardent le leur jusqu'à leur remplacement.
 *
 * Il n'écrit rien : il rend `true` à la carte, qui fait passer l'écriture par
 * la mécanique `saved` de la page — celle qui relit et annonce.
 */
@Component({
  selector: 'app-mandate-scheme-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './mandate-scheme-dialog.html',
  styleUrl: './mandate-scheme-dialog.scss',
})
export class MandateSchemeDialog implements FoldPanelContent<MandateSchemeDialogData> {
  /** Un dialogue centré : la décision suspend l'écran, on ne lit rien à côté. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<MandateSchemeDialogData>();

  private readonly api = inject(LegalEntitiesService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly stage = signal<Stage>('loading');
  protected readonly failure = signal('');
  private readonly usage = signal<MandateSchemeUsageView | null>(null);

  protected readonly title = computed(() => `Passer en ${SEPA_SCHEME_LABELS[this.data().to]} ?`);
  protected readonly consequence = computed(() => CONSEQUENCE[this.data().to]);

  protected readonly draftsLine = computed(() => {
    const drafts = this.usage()?.drafts ?? 0;
    return drafts === 0
      ? 'Aucun brouillon de mandat en attente : aucun ne devient caduc.'
      : `${counted(drafts, 'brouillon de mandat deviendra caduc', 'brouillons de mandat deviendront caducs')} : les clients concernés devront en générer un nouveau.`;
  });

  /**
   * Les actifs qui RESTENT sur l'ancien schéma. Ceux déjà frappés sous le
   * schéma choisi ne sont pas concernés : les compter ferait croire qu'ils
   * restent en arrière.
   */
  protected readonly activesLine = computed(() => {
    const from = this.data().from;
    const actives = this.usage()?.activeByScheme[from] ?? 0;
    const label = SEPA_SCHEME_LABELS[from];
    return actives === 0
      ? `Aucun mandat actif sous ${label}.`
      : `${counted(actives, 'mandat actif garde', 'mandats actifs gardent')} leur schéma (${label}) jusqu'à leur remplacement.`;
  });

  protected readonly confirmLabel = computed(
    () => `Passer en ${SEPA_SCHEME_LABELS[this.data().to]}`,
  );

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const id = this.data().entityId;
      untracked(() => void this.load(id));
    });
  }

  protected retry(): void {
    void this.load(this.data().entityId);
  }

  protected confirm(): void {
    if (this.stage() === 'ready') {
      this.panel.close(true);
    }
  }

  protected cancel(): void {
    this.panel.close(false);
  }

  private async load(id: string): Promise<void> {
    this.stage.set('loading');
    try {
      this.usage.set(await this.api.mandateSchemeUsage(id));
      this.stage.set('ready');
    } catch (caught) {
      this.failure.set(httpErrorMessage(caught, 'Le service ne répond pas pour le moment.'));
      this.stage.set('failed');
    }
  }
}
