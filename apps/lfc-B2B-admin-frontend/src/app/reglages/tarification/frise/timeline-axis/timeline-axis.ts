import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import {
  axisSpan,
  instantAt,
  monthTicks,
  packLanes,
  percentOf,
  snapToDay,
  weekTicks,
  type AxisSpan,
} from '../axis-model';

/** Une décision posée sur l'axe : une règle, un barème. */
export interface AxisBand {
  readonly id: string;
  readonly label: string;
  readonly validFrom: string;
  readonly validTo: string | null;
}

/**
 * Ce que l'axe rend quand on lâche : **un jour**, ou **deux**.
 *
 * Deux formes et non une paire dont les deux bouts seraient parfois égaux : un
 * marqueur seul et une zone ne répondent pas à la même question, et l'appelant
 * doit choisir laquelle il pose.
 */
export type AxisSelection =
  | { readonly kind: 'instant'; readonly day: string }
  | { readonly kind: 'zone'; readonly from: string; readonly to: string };

/** En deçà, un glissement est un clic tremblé, pas une intention de zone. */
const DRAG_THRESHOLD_PERCENT = 1.5;

/**
 * **L'axe du temps, et les marqueurs qu'on y pose à la main.**
 *
 * Un clic pose un marqueur : le catalogue s'affiche tel qu'il était ce jour-là.
 * Un clic maintenu puis glissé ouvre une **zone** : deux catalogues, et entre
 * eux ce qui a bougé.
 *
 * Les barres des décisions restent visibles sous l'axe pendant qu'on glisse —
 * c'est tout l'intérêt de poser les marqueurs ICI plutôt que dans deux champs de
 * date : on vise une promotion, un barème, la veille d'un changement, sans avoir
 * à lire une date pour la recopier.
 *
 * **Le clavier n'est pas un second choix.** Les deux champs de date de l'en-tête
 * pilotent la même sélection : un axe qui ne s'atteindrait qu'à la souris
 * fermerait l'écran à ceux qui n'en ont pas, et rendrait la saisie précise
 * impossible à tout le monde.
 *
 * L'instant est **arrondi au jour** : le pointeur offre une précision que la
 * donnée n'a pas — les fenêtres de validité sont des jours, et deux lectures à
 * trois heures d'écart rendraient le même catalogue en donnant l'illusion
 * d'avoir mesuré quelque chose.
 */
@Component({
  selector: 'app-timeline-axis',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './timeline-axis.html',
  styleUrl: './timeline-axis.scss',
})
export class TimelineAxis {
  readonly bands = input.required<readonly AxisBand[]>();
  /** La sélection courante, pour que l'axe suive les champs de date de l'en-tête. */
  readonly selection = input<AxisSelection | null>(null);
  readonly selected = output<AxisSelection>();

  /** Pris une fois au montage : un axe qui glisserait sous les marqueurs mentirait. */
  private readonly now = Date.now();

  /** Pendant le glissement — en pourcentage, la seule unité que l'axe connaisse. */
  private readonly anchorPercent = signal<number | null>(null);
  private readonly cursorPercent = signal<number | null>(null);

  protected readonly span = computed<AxisSpan>(() => axisSpan(this.bands(), this.now));
  protected readonly ticks = computed(() => monthTicks(this.span()));

  /**
   * Les lundis, en traits fins. Le mois situe, la semaine permet de **viser** :
   * « vers le 20 » se pointe à trois jours près sur une bande de trente.
   *
   * Effacés dès que l'axe s'étale : au-delà d'une soixantaine de semaines, les
   * traits se touchent et deviennent une trame — un bruit, plus un repère.
   */
  protected readonly weeks = computed(() => {
    const ticks = weekTicks(this.span());
    return ticks.length > 60 ? [] : ticks;
  });

  /**
   * Les mois en **bandes**, une sur deux teintée.
   *
   * L'œil situe alors une barre sans suivre un trait jusqu'à la graduation : un
   * repère connu — « c'est dans septembre » — vaut mieux qu'une règle graduée
   * qu'il faut lire.
   */
  protected readonly monthBands = computed(() => {
    const ticks = this.ticks();
    return ticks.map((tick, index) => ({
      at: tick.at,
      left: tick.percent,
      width: (ticks[index + 1]?.percent ?? 100) - tick.percent,
      shaded: index % 2 === 1,
    }));
  });

  /** Aujourd'hui, marqué d'un trait : un axe sans « maintenant » se lit mal. */
  protected readonly todayPercent = computed(() => percentOf(this.span(), this.now));

  /**
   * Les barres, **rangées en voies** : deux décisions qui ne se croisent pas
   * partagent leur ligne. Une ligne par décision donnait une frise haute comme un
   * immeuble, où l'œil perdait l'axe avant d'avoir fini de descendre.
   */
  protected readonly placed = computed(() => {
    const span = this.span();
    return packLanes(this.bands(), span).map(({ band, lane }) => {
      const left = percentOf(span, Date.parse(band.validFrom));
      const right = percentOf(span, band.validTo === null ? span.to : Date.parse(band.validTo));
      return {
        id: band.id,
        label: band.label,
        lane,
        left,
        width: Math.max(1.5, right - left),
        /** Une fin ouverte ne se ferme pas : la barre s'estompe au lieu de s'arrêter net. */
        open: band.validTo === null,
      };
    });
  });

  /** La hauteur de la piste suit le nombre de voies, jamais le nombre de barres. */
  protected readonly laneCount = computed(() =>
    Math.max(1, ...this.placed().map((bar) => bar.lane + 1)),
  );

  /**
   * Les marqueurs à dessiner : ceux du glissement en cours, sinon la sélection.
   *
   * Le geste prime sur l'état pour que la zone se dessine **pendant** qu'on la
   * trace ; sans ça, on tirerait un trait invisible jusqu'au relâchement.
   */
  protected readonly markers = computed<readonly number[]>(() => {
    const anchor = this.anchorPercent();
    const cursor = this.cursorPercent();
    if (anchor !== null && cursor !== null) {
      return Math.abs(cursor - anchor) < DRAG_THRESHOLD_PERCENT ? [anchor] : [anchor, cursor];
    }
    return this.selectionPercents();
  });

  /**
   * **La date sous le doigt.** Un marqueur sans sa date oblige à descendre lire
   * le champ pour savoir ce qu'on vient de viser — soit exactement le
   * va-et-vient que poser le marqueur ici devait supprimer.
   */
  protected readonly labels = computed(() =>
    this.markers().map((percent) => ({
      percent,
      day: frenchDay(instantAt(this.span(), percent)),
    })),
  );

  /** Combien de jours la zone couvre — la question qui suit toujours « du…au ». */
  protected readonly zoneDays = computed(() => {
    const [first, second] = [...this.markers()].sort((left, right) => left - right);
    if (first === undefined || second === undefined) {
      return null;
    }
    const span = this.span();
    const days = Math.round((instantAt(span, second) - instantAt(span, first)) / 86_400_000);
    return days <= 0 ? null : days;
  });

  /** La bande grisée entre deux marqueurs — elle n'existe qu'à deux. */
  protected readonly zone = computed(() => {
    const [first, second] = [...this.markers()].sort((left, right) => left - right);
    if (first === undefined || second === undefined) {
      return null;
    }
    return { left: first, width: second - first };
  });

  protected onPointerDown(event: PointerEvent): void {
    const percent = this.percentFrom(event);
    if (percent === null) {
      return;
    }
    (event.target as Element).setPointerCapture(event.pointerId);
    this.anchorPercent.set(percent);
    this.cursorPercent.set(percent);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.anchorPercent() === null) {
      return;
    }
    this.cursorPercent.set(this.percentFrom(event) ?? this.cursorPercent());
  }

  protected onPointerUp(event: PointerEvent): void {
    const anchor = this.anchorPercent();
    const cursor = this.percentFrom(event) ?? this.cursorPercent();
    this.anchorPercent.set(null);
    this.cursorPercent.set(null);
    if (anchor === null || cursor === null) {
      return;
    }
    this.selected.emit(this.selectionBetween(anchor, cursor));
  }

  /** Un glissement trop court est un clic : on ne pose qu'un marqueur. */
  private selectionBetween(anchor: number, cursor: number): AxisSelection {
    const span = this.span();
    if (Math.abs(cursor - anchor) < DRAG_THRESHOLD_PERCENT) {
      return { kind: 'instant', day: snapToDay(instantAt(span, anchor)) };
    }
    const [low, high] = anchor < cursor ? [anchor, cursor] : [cursor, anchor];
    return {
      kind: 'zone',
      from: snapToDay(instantAt(span, low)),
      to: snapToDay(instantAt(span, high)),
    };
  }

  private selectionPercents(): readonly number[] {
    const selection = this.selection();
    if (selection === null) {
      return [];
    }
    const span = this.span();
    return selection.kind === 'instant'
      ? [percentOf(span, Date.parse(`${selection.day}T00:00:00.000Z`))]
      : [
          percentOf(span, Date.parse(`${selection.from}T00:00:00.000Z`)),
          percentOf(span, Date.parse(`${selection.to}T00:00:00.000Z`)),
        ];
  }

  private percentFrom(event: PointerEvent): number | null {
    const track = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    if (track === undefined || track.width === 0) {
      return null;
    }
    return ((event.clientX - track.left) / track.width) * 100;
  }
}

/** « 12 sept. » — la forme courte, celle qu'on lit sans s'arrêter. */
function frenchDay(at: number): string {
  return new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
