import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  BUSINESS_TIME_ZONE,
  addDays,
  instantToLocal,
  localToInstant,
  weekdayOf,
} from '@lfd/contracts';
import type { BillingCycleView } from '@lfd/contracts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** En deçà, parler en jours arrondirait « demain matin » à « il reste 1 jour ». */
const HOURS_BEFORE_DAYS = 48;
/** Un cycle fait un mois ; au-delà, la boucle des lundis est un défaut, pas une donnée. */
const MAX_WEEK_TICKS = 64;

/** Une graduation hebdomadaire, posée sur l'axe du cycle. */
interface WeekTick {
  readonly at: number;
  readonly percent: number;
  readonly label: string;
}

/**
 * **La barre du cycle de prélèvement** — deux bornes, et où l'on en est entre
 * elles.
 *
 * ## Ce que le serveur ne dit pas, et pourquoi
 *
 * `BillingCycleView` ne porte que deux instants. La progression et le temps
 * restant sont calculés **ici**, avec l'horloge du navigateur : renvoyés par
 * l'API, ils seraient déjà vieux à l'affichage, et deux définitions de « où en
 * est-on » cohabiteraient. L'instant de lecture est une entrée (`now`), ce qui
 * rend la barre testable sans figer l'horloge du processus de test.
 *
 * L'horloge est prise **à l'affichage** et ne bat pas : un tableau de bord
 * laissé ouvert une nuit se relit en le rechargeant, et une barre qui rampe
 * seule coûterait un rendu par minute pour un pixel.
 *
 * ## 🔴 `closesAt` est EXCLUSIF, et le libellé doit le dire
 *
 * Une commande passée exactement à cet instant appartient au cycle **suivant**.
 * D'où « clôture le 1er octobre à 00h00 » et jamais « jusqu'au 30 septembre
 * inclus » : les deux désignent la même seconde et n'envoient pas la commande de
 * fin de soirée dans le même mois.
 *
 * ## 🔴 Jamais les composantes UTC
 *
 * Les bornes tombent à minuit **local** — `T22:00:00Z` en été, `T23:00:00Z` en
 * hiver. Lues en UTC, elles afficheraient la veille la moitié de l'année. Tout
 * ce qui se lit ici passe donc par `BUSINESS_TIME_ZONE`, comme partout où le
 * dépôt convertit un jour en instant (`shared/business-day.ts`).
 *
 * ## Aucun montant
 *
 * Un cycle n'a pas « un montant » : il a un montant par tentative de
 * prélèvement, reconstitué à chaque présentation. Un total figé sur la barre
 * mentirait dès le premier rejet — et le serveur ne le sert pas.
 */
@Component({
  selector: 'app-cycle-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cycle-bar.html',
  styleUrl: './cycle-bar.scss',
})
export class CycleBar {
  readonly cycle = input.required<BillingCycleView>();

  /**
   * L'instant de lecture. Pris une fois au montage — une barre qui avancerait
   * toute seule promettrait une fraîcheur que le reste de l'écran n'a pas.
   */
  readonly now = input(Date.now());

  private readonly startMs = computed(() => Date.parse(this.cycle().startsAt));
  private readonly closeMs = computed(() => Date.parse(this.cycle().closesAt));

  /** L'ouverture, en clair. Toujours dans le fuseau des affaires. */
  protected readonly startLabel = computed(() => longDay(this.startMs()));
  /** La clôture, en clair — la borne que la commande de fin de soirée franchit. */
  protected readonly closeLabel = computed(() => longDay(this.closeMs()));

  /**
   * Où l'on en est, en pourcentage — borné, parce qu'un cycle qu'on lit après sa
   * clôture (le temps qu'une nouvelle soit enregistrée) ne doit pas déborder.
   */
  protected readonly progressPercent = computed(() => {
    const span = this.closeMs() - this.startMs();
    if (!Number.isFinite(span) || span <= 0) {
      return 0;
    }
    const ratio = (this.now() - this.startMs()) / span;
    return Math.min(100, Math.max(0, ratio * 100));
  });

  /** Ce qu'il reste avant la clôture — en heures tant qu'elle est proche. */
  protected readonly remainingLabel = computed(() => {
    const left = this.closeMs() - this.now();
    if (!Number.isFinite(left) || left <= 0) {
      return 'cycle clos — le suivant a commencé';
    }
    const hours = left / HOUR_MS;
    if (hours < 1) {
      return 'clôture dans moins d’une heure';
    }
    if (hours < HOURS_BEFORE_DAYS) {
      return `il reste ${String(Math.floor(hours))} h`;
    }
    const days = Math.floor(left / DAY_MS);
    return `il reste ${String(days)} jours`;
  });

  /**
   * Ce que la piste dit à un lecteur d'écran.
   *
   * La barre est un `role="img"` : elle ne se manipule pas, et un `progressbar`
   * annoncerait une tâche en cours plutôt qu'une fenêtre de temps.
   */
  protected readonly summary = computed(
    () =>
      `Cycle ouvert le ${this.startLabel()}, clôture le ${this.closeLabel()} à 00h00 — ${this.remainingLabel()}.`,
  );

  /**
   * Les lundis, en traits fins.
   *
   * Un mois nu ne permet pas de viser : « c'était vers le 20 » se pointe à trois
   * jours près sur une bande de trente. C'est le même pas intermédiaire que la
   * frise tarifaire, et pour la même raison.
   */
  protected readonly weeks = computed<readonly WeekTick[]>(() => {
    const start = this.startMs();
    const close = this.closeMs();
    const span = close - start;
    if (!Number.isFinite(span) || span <= 0) {
      return [];
    }
    return mondaysBetween(start, close).map((at) => ({
      at,
      percent: ((at - start) / span) * 100,
      // Le quantième **local** : en UTC, un lundi de juillet s'affiche dimanche.
      label: String(Number(instantToLocal(new Date(at)).day.slice(8, 10))),
    }));
  });
}

/**
 * Les lundis strictement compris entre deux instants, à minuit **local**.
 *
 * Calculés sur le jour local puis reconvertis, jamais par pas de 7 × 86 400 s :
 * une semaine qui enjambe un changement d'heure ne fait pas 168 heures, et les
 * traits auraient dérivé d'une heure à partir de la bascule.
 */
function mondaysBetween(startMs: number, closeMs: number): readonly number[] {
  const out: number[] = [];
  const first = instantToLocal(new Date(startMs)).day;
  // `weekdayOf` rend 0 le dimanche ; la semaine française commence lundi.
  let day = addDays(first, (8 - weekdayOf(first)) % 7);
  for (let guard = 0; guard < MAX_WEEK_TICKS; guard += 1) {
    const at = localToInstant(day, '00:00');
    if (at === null) {
      // Minuit n'existe pas ce jour-là (aucun fuseau européen aujourd'hui) : on
      // saute le trait plutôt que d'en poser un faux.
      day = addDays(day, 7);
      continue;
    }
    if (at.getTime() >= closeMs) {
      return out;
    }
    if (at.getTime() > startMs) {
      out.push(at.getTime());
    }
    day = addDays(day, 7);
  }
  return out;
}

/**
 * « 1 octobre 2026 » — la borne en clair, dans le fuseau des affaires.
 *
 * 🔴 `timeZone` explicite et non le fuseau du navigateur : un poste réglé sur
 * Londres afficherait la veille pour toutes les bornes de l'été, et rien ne le
 * signalerait — les deux dates sont plausibles.
 */
function longDay(at: number): string {
  return new Date(at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: BUSINESS_TIME_ZONE,
  });
}
