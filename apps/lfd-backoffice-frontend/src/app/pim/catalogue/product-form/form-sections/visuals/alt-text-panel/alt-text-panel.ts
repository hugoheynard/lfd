import { KeyValuePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldListboxComponent,
  FoldOptionComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { formatGap, formatGapSentence, MEDIA_ROLE_FORMATS } from '../../../../media-formats';
import { isPublishedMediaRole } from '../../../../media-roles';
import { MEDIA_ROLE_LABELS } from '../../../product-form-store';

/** Charge d'ouverture : l'image qu'on décrit, et ce qui en est déjà écrit. */
export interface AltTextPanelData {
  readonly url: string;
  /**
   * L'USAGE de ce visuel. **`undefined` = ce porteur n'a pas la notion**, et le
   * panneau ne propose alors rien.
   *
   * 🔴 La notion n'existe que là où quelqu'un la LIT. Une fiche produit en a un
   * consommateur — la vitrine du canal B2B cherche le `hero`. Une famille n'en
   * a aucun (vérifié le 2026-09-23 : rien sous `pim/channels/` ne consulte le
   * rôle d'un visuel de famille). Offrir le choix là-bas ferait décider pour
   * rien, et cette décision-là finirait par se croire lue.
   *
   * ⚠️ C'était un booléen « principal » jusqu'au 2026-09-23 : un seul des cinq
   * usages était atteignable, les quatre autres n'avaient aucun écran.
   */
  readonly role?: string | undefined;
  /** Les dimensions mesurées au dépôt ; absentes, on les lit sur l'aperçu chargé. */
  readonly width?: number | null | undefined;
  readonly height?: number | null | undefined;
}

/**
 * Ce que le panneau rend en se fermant. Une ENVELOPPE, et pas le texte nu :
 * `closed` rend `undefined` quand on annule, et « vidé » est aussi un texte
 * `undefined`. Sans l'enveloppe, annuler effacerait ce qu'on venait de renoncer
 * à changer.
 */
export interface AltTextPanelResult {
  /**
   * L'usage retenu. `undefined` quand le porteur n'a pas la notion (cf.
   * {@link AltTextPanelData.role}).
   *
   * Le panneau ne voit qu'une image : il **déclare une intention**, il ne
   * range pas la liste. C'est le magasin qui déloge celui qui portait le même
   * rôle unique, en une seule mise à jour — sans quoi deux ouvertures
   * deviendraient exprimables le temps d'un aller-retour.
   */
  readonly role?: string | undefined;
  /** Le visuel a-t-il été RETIRÉ de la fiche ? Le retrait vit ici parce que
   *  c'est ici qu'on voit l'image en grand — décider de la jeter demande de la
   *  regarder. Il ne touche PAS la bibliothèque. */
  readonly removed?: boolean;
}

/**
 * Panneau **Visuel** — son USAGE, et son retrait de la fiche.
 *
 * 🔴 Il portait aussi l'étiquette et les trois textes alternatifs, jusqu'au
 * 2026-09-23. Ils décrivent l'IMAGE, pas l'emploi qu'une fiche en fait, et une
 * image est partagée : corriger une faute ici changeait silencieusement ce
 * qu'une autre fiche affichait. Ils se saisissent dans la médiathèque, qui en
 * est le seul point.
 *
 * Ce qui reste appartient bien au porteur — quel usage ce visuel a SUR CETTE
 * FICHE, et faut-il l'en retirer.
 *
 * L'image est là, en grand : on ne choisit pas l'usage d'une image qu'on ne
 * voit pas, et décider de la retirer demande de la regarder.
 */
@Component({
  selector: 'app-alt-text-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    KeyValuePipe,
    FoldButtonComponent,
    FoldCalloutComponent,
  ],
  templateUrl: './alt-text-panel.html',
  styleUrl: './alt-text-panel.scss',
})
export class AltTextPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject<FoldPanelRef<AltTextPanelResult>>(FoldPanelRef);

  readonly data = input.required<AltTextPanelData>();

  /** `undefined` tant que le porteur n'a pas la notion — voir la donnée. */
  protected readonly role = signal<string | undefined>(undefined);
  protected readonly roles = MEDIA_ROLE_LABELS;
  protected readonly isPublished = isPublishedMediaRole;

  /** Les dimensions lues sur l'aperçu chargé — repli quand le dépôt ne les a pas mesurées. */
  private readonly loaded = signal<{ width: number; height: number } | null>(null);

  /**
   * Le signalement de format pour l'usage choisi — une phrase, jamais un refus :
   * une image mal cadrée reste publiable, et c'est le point focal qui décide
   * ce que la coupe garde.
   */
  protected readonly formatWarning = computed(() => {
    const chosen = this.role();
    const entry = chosen === undefined ? undefined : MEDIA_ROLE_FORMATS[chosen];
    if (entry === undefined) {
      return null;
    }
    const { width, height } = this.data();
    const measured =
      typeof width === 'number' && typeof height === 'number' ? { width, height } : this.loaded();
    const gap = formatGap(measured?.width, measured?.height, entry.format);
    return gap === null ? null : formatGapSentence(gap, entry);
  });

  constructor() {
    effect(() => {
      this.role.set(this.data().role);
    });
  }

  protected measure(event: Event): void {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.naturalWidth > 0) {
      this.loaded.set({ width: image.naturalWidth, height: image.naturalHeight });
    }
  }

  protected submit(): void {
    this.ref.close({ ...(this.role() === undefined ? {} : { role: this.role() }) });
  }

  /** Retire le visuel du produit — **pas de la bibliothèque**. L'image reste
   *  disponible pour une autre fiche ; c'est la médiathèque qui la supprime. */
  protected remove(): void {
    this.ref.close({ removed: true });
  }

  /** Ferme SANS résultat — l'enveloppe absente veut dire « annulé ». */
  protected cancel(): void {
    this.ref.close();
  }
}
