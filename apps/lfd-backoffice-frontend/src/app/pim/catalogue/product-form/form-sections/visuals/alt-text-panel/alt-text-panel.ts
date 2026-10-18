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
  FoldCheckboxComponent,
  FoldFieldsetComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { formatGap, formatGapSentence, MEDIA_ROLE_FORMATS } from '../../../../media-formats';
import { isPublishedMediaRole } from '../../../../media-roles';
import { SINGLE_MEDIA_ROLES } from '../../../../media-usages';
import { MEDIA_ROLE_LABELS } from '../../../product-form-store';

/** Charge d'ouverture : l'image qu'on décrit, et ce qui en est déjà écrit. */
export interface AltTextPanelData {
  readonly url: string;
  /**
   * Les USAGES de ce visuel — plusieurs depuis le 2026-10-18 (une même image
   * peut être ouverture ET vignette). **`undefined` = ce porteur n'a pas la notion**, et le
   * panneau ne propose alors rien.
   *
   * 🔴 La notion n'existe que là où quelqu'un la LIT. Une fiche produit en a un
   * consommateur — la vitrine du canal B2B cherche le `hero`. Une famille n'en
   * a aucun (vérifié le 2026-09-23 : rien sous `pim/channels/` ne consulte le
   * rôle d'un visuel de famille). Offrir le choix là-bas ferait décider pour
   * rien, et cette décision-là finirait par se croire lue.
   *
   * ⚠️ C'était un booléen « principal » jusqu'au 2026-09-23, puis un usage
   * unique jusqu'au 2026-10-18.
   */
  readonly roles?: readonly string[] | undefined;
  /**
   * Qui porte déjà chaque usage UNIQUE (ouverture, vignette) parmi les AUTRES
   * images de la fiche — pour dire, au moment où l'on coche, d'où il partira.
   */
  readonly holders?: Readonly<Record<string, string>> | undefined;
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
   * Les usages retenus — vide permis : l'image reste à l'écran, et ne
   * s'enregistre pas. `undefined` quand le porteur n'a pas la notion (cf.
   * {@link AltTextPanelData.roles}).
   *
   * Le panneau ne voit qu'une image : il **déclare une intention**, il ne
   * range pas la liste. C'est le magasin qui déloge celui qui portait le même
   * rôle unique, en une seule mise à jour — sans quoi deux ouvertures
   * deviendraient exprimables le temps d'un aller-retour.
   */
  readonly roles?: readonly string[] | undefined;
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
    FoldFieldsetComponent,
    FoldCheckboxComponent,
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
  protected readonly roles = signal<readonly string[] | undefined>(undefined);
  protected readonly choices = Object.entries(MEDIA_ROLE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  /** Les dimensions lues sur l'aperçu chargé — repli quand le dépôt ne les a pas mesurées. */
  private readonly loaded = signal<{ width: number; height: number } | null>(null);

  /**
   * Les signalements de format des usages cochés — des phrases, jamais un
   * refus : une image mal cadrée reste publiable, et c'est le point focal qui
   * décide ce que la coupe garde.
   */
  protected readonly formatWarnings = computed(() => {
    const { width, height } = this.data();
    const measured =
      typeof width === 'number' && typeof height === 'number' ? { width, height } : this.loaded();
    return (this.roles() ?? []).flatMap((role) => {
      const entry = MEDIA_ROLE_FORMATS[role];
      const gap =
        entry === undefined ? null : formatGap(measured?.width, measured?.height, entry.format);
      return entry === undefined || gap === null ? [] : [formatGapSentence(gap, entry)];
    });
  });

  constructor() {
    effect(() => {
      this.roles.set(this.data().roles);
    });
  }

  protected isChecked(role: string): boolean {
    return (this.roles() ?? []).includes(role);
  }

  protected toggle(role: string, checked: boolean): void {
    const current = (this.roles() ?? []).filter((kept) => kept !== role);
    this.roles.set(checked ? [...current, role] : current);
  }

  /**
   * Ce que la case dit sous elle, cochée : qu'elle ne paraît nulle part
   * (2026-10-10, un croissant en galerie a passé pour une panne), ou de quelle
   * image l'usage unique va partir — l'écran le dit au lieu de laisser le
   * serveur refuser le doublon.
   */
  protected hintOf(role: string): string | undefined {
    if (!this.isChecked(role)) {
      return undefined;
    }
    if (!isPublishedMediaRole(role)) {
      return "Cet usage n'est publié sur aucun canal : la boutique ne montre que l'ouverture et la vignette de rayon.";
    }
    const holder = SINGLE_MEDIA_ROLES.includes(role) ? this.data().holders?.[role] : undefined;
    return holder === undefined ? undefined : `Cet usage sera retiré de ${holder}.`;
  }

  protected measure(event: Event): void {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.naturalWidth > 0) {
      this.loaded.set({ width: image.naturalWidth, height: image.naturalHeight });
    }
  }

  protected submit(): void {
    const roles = this.roles();
    this.ref.close(roles === undefined ? {} : { roles });
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
