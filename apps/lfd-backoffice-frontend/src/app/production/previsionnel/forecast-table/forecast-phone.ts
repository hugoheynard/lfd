import { DestroyRef, type Signal, computed, effect, inject, signal } from '@angular/core';
import type { FoldSelectOption } from 'fold-ng';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

import { rememberGroup, rememberedGroup } from '../phone-memory';
import type { ForecastColumn } from '../forecast-column';
import type { ForecastCell, ForecastProduct, ForecastRayon } from '../previsionnel-matrix';
import { phoneDayTotals, rayonsToDo } from './phone-day';

/**
 * Sous cette largeur, la table montre **une colonne à la fois** (Hugo,
 * 2026-11-25) : sur un téléphone, sept colonnes forcent un défilement
 * horizontal où l'on perd le jour qu'on lit. Des flèches passent d'une
 * colonne à l'autre ; les gestes de la colonne deviennent des icônes.
 */
export const PHONE_QUERY = '(max-width: 640px)';

/**
 * La requête du téléphone, ou `null` quand l'environnement n'en sait rien
 * (rendu serveur, jsdom) : la table retombe alors sur le bureau.
 */
export function phoneMedia(): MediaQueryList | null {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? null
    : window.matchMedia(PHONE_QUERY);
}

/** Le pas qui sort de la table : la page déplace sa fenêtre. */
export type ForecastStepBeyond = -1 | 1;

/** Sur téléphone, « tous les groupes » : la clé vide. */
export const ALL_GROUPS = '';

/** Ce que la lecture au téléphone rend à la table qui la porte. */
export interface ForecastPhoneOutlets {
  /** Une flèche dépasse le bord : la page déplace sa fenêtre. */
  readonly stepBeyond: (direction: ForecastStepBeyond) => void;
  /** La colonne montrée a changé : la page la retient. */
  readonly focused: (key: string) => void;
}

/**
 * **La table lue au téléphone** — une colonne, un groupe, ce qu'il y a à faire.
 *
 * Tout ce qui ne vaut que sur téléphone vit ici, hors du composant : la
 * colonne montrée et ses flèches, le groupe choisi et sa mémoire, les lignes
 * à zéro masquées, le pied qui suit le groupe, les trois chiffres des jours à
 * réassorts. Hors téléphone, chaque lecture rend celle du bureau : toutes les
 * colonnes, tous les groupes, le pied du serveur.
 *
 * Se construit dans un contexte d'injection (champ d'un composant) : elle
 * écoute la largeur de l'écran et pose deux effets.
 */
export class ForecastPhone {
  /** Le téléphone : une colonne à la fois. */
  readonly phone = signal(false);

  /** L'indice de la colonne montrée sur téléphone. */
  private readonly focusIndex = signal(0);

  /** Où se poser quand les colonnes changent après un pas hors de la table. */
  private landing: 'first' | 'last' | null = null;

  /** Les indices des colonnes dessinées : toutes, ou celle du téléphone. */
  readonly shown = computed<readonly number[]>(() => {
    const count = this.columns().length;
    if (!this.phone()) {
      return Array.from({ length: count }, (_, index) => index);
    }
    return count === 0 ? [] : [Math.min(this.focusIndex(), count - 1)];
  });

  /** La colonne montrée sur téléphone. */
  readonly focused = computed(() => this.columns()[this.shown()[0] ?? -1]);

  /** Le groupe (poste ou rayon) choisi sur téléphone — vide : tous. */
  readonly pickedGroup = signal(rememberedGroup() ?? ALL_GROUPS);

  /** Un seul groupe à l'écran : sa ligne de tête serait redite par le choix. */
  readonly onePicked = computed(() => this.phone() && this.pickedGroup() !== ALL_GROUPS);

  /**
   * Le choix du groupe : chacun dit ses références à faire et ses pièces **du
   * jour affiché** — c'est ce qu'on lit en choisissant son poste (Hugo,
   * 2026-11-25). « Tous » compte chaque référence une fois, comme le pied.
   */
  readonly groupOptions = computed<readonly FoldSelectOption<string>[]>(() => {
    const index = this.day();
    const describe = (label: string, rayons: readonly ForecastRayon[]): string => {
      const totals = phoneDayTotals(rayons, index);
      return `${label} — ${String(totals.refs)} réf. / ${String(totals.pieces)} pcs`;
    };
    return [
      { value: ALL_GROUPS, label: describe('Tous', this.rayons()) },
      ...this.rayons().map((rayon) => ({
        value: rayon.key,
        label: describe(rayon.label, [rayon]),
      })),
    ];
  });

  /** Les groupes dessinés : tous, ou le choisi réduit à ce qu'il a à faire. */
  readonly shownRayons = computed(() => {
    if (!this.phone()) {
      return this.rayons();
    }
    const picked = this.pickedGroup();
    const match = this.rayons().filter((rayon) => rayon.key === picked);
    const groups = picked === ALL_GROUPS || match.length === 0 ? this.rayons() : match;
    return rayonsToDo(groups, this.day());
  });

  /**
   * Trois chiffres par produit — le total, la part des commandes, celle des
   * boutiques (Hugo, 2026-11-25) — les seuls jours qui ont des réassorts : sans
   * eux, la colonne des commandes redirait le total et celle des boutiques
   * serait vide. Jamais dans la journée par tranche, dont la case dit
   * « sorti / à sortir ». La décision vaut pour le jour, pas pour le groupe :
   * changer de poste ne change pas les colonnes.
   */
  readonly split = computed(
    () =>
      this.phone() &&
      phoneDayTotals(this.rayons(), this.day()).shops > 0 &&
      !this.rayons().some((rayon) =>
        rayon.lines.some((line) =>
          line.cells.some((cell) => cell.progress !== undefined && cell.progress !== null),
        ),
      ),
  );

  /** Ce que le jour affiché demande aux groupes à l'écran — le pied du téléphone. */
  readonly totals = computed(() => phoneDayTotals(this.shownRayons(), this.day()));

  constructor(
    private readonly columns: Signal<readonly ForecastColumn[]>,
    private readonly rayons: Signal<readonly ForecastRayon[]>,
    private readonly outlets: ForecastPhoneOutlets,
  ) {
    const media = phoneMedia();
    if (media !== null) {
      this.phone.set(media.matches);
      const onChange = (event: MediaQueryListEvent): void => this.phone.set(event.matches);
      media.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));
    }
    effect(() => {
      const key = this.focused()?.key;
      if (this.phone() && key !== undefined) {
        this.outlets.focused(key);
      }
    });
    effect(() => {
      const count = this.columns().length;
      if (this.landing !== null) {
        this.focusIndex.set(this.landing === 'last' ? Math.max(count - 1, 0) : 0);
        this.landing = null;
      }
    });
  }

  /** Une colonne en avant ou en arrière ; au bord, la page prend le relais. */
  step(direction: ForecastStepBeyond): void {
    const next = this.focusIndex() + direction;
    if (next >= 0 && next < this.columns().length) {
      this.focusIndex.set(next);
      return;
    }
    this.landing = direction === 1 ? 'first' : 'last';
    this.outlets.stepBeyond(direction);
  }

  /** Choisir un groupe, et le retenir pour la prochaine ouverture. */
  pickGroup(key: string): void {
    this.pickedGroup.set(key);
    rememberGroup(key);
  }

  /**
   * La valeur d'une ligne du pied : sur téléphone, celle des groupes à
   * l'écran — avec un poste choisi, tout l'écran parle de lui. Les lignes que
   * le téléphone ne compte pas gardent la valeur du serveur.
   */
  footValue(column: ForecastColumn, line: number, key: string): string {
    if (this.phone()) {
      if (key === 'pieces') {
        return String(this.totals().pieces);
      }
      if (key === 'resupplies') {
        const shops = this.totals().shops;
        return shops > 0 ? String(shops) : '';
      }
    }
    return column.foot[line] ?? '';
  }

  /** Une part d'une case, dans l'unité du produit (« 2,15 kg ») — vide pour zéro. */
  partLabel(line: ForecastProduct, cell: ForecastCell, part: 'orders' | 'shops'): string {
    const quantity = part === 'orders' ? cell.quantity - cell.resupply : cell.resupply;
    return quantity > 0 ? saleQuantityLabel(quantity, line.saleUnit ?? undefined) : '';
  }

  /** L'indice de la colonne lue au téléphone. */
  private day(): number {
    return this.shown()[0] ?? 0;
  }
}
