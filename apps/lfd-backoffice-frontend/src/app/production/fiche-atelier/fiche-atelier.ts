import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSurfaceDirective,
  FoldTabsComponent,
  FoldToastComponent,
  FoldViewToggleComponent,
  FoldLoadingStateComponent,
  type FoldSelectItem,
  type FoldTabItem,
  type FoldViewToggleOption,
} from 'fold-ng';

import type { WorkshopGroup, WorkshopLine } from '@lfd/contracts';

import { StaffPrefsService } from '../../shared/staff-prefs/staff-prefs.service';
import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import { DayVersionWatcher } from '../../shared/day-version/day-version-watcher';
import { isoDay } from '../worksheet-day';
import { DriftBanner } from './drift-banner/drift-banner';
import { WorkshopDayReader } from './workshop-day.reader';
import { WorkshopGestures } from './workshop-gestures';
import { WorkshopClock } from './workshop-clock';
import { WorkshopKeypadOpener } from './workshop-keypad-opener';
import { WorkshopShortcutsReader } from './workshop-shortcuts.reader';
import { WorksheetLine } from './worksheet-line/worksheet-line';
import { type SlotEntry, WorksheetSlots } from './worksheet-slots/worksheet-slots';
import { WorkshopWallClock } from './workshop-wall-clock/workshop-wall-clock';

/**
 * 🔴 **Le seuil du fournil — 1024 px, pas les 640 px du back-office.**
 *
 * La bascule est structurelle, pas cosmétique : au-dessus, les onglets de
 * catégorie et la colonne d'initiales tiennent ; en dessous, les onglets
 * deviennent un menu qu'on ouvre par erreur les mains sales. C'est la largeur
 * où la barre d'onglets cesse de tenir sur une ligne qui décide.
 *
 * ⚠️ La même valeur est écrite dans `fiche-atelier.scss` (une media query ne lit
 * pas un `const`). Les deux bougent ensemble ou l'écran se coupe en deux.
 */
const WORKSHOP_NARROW = '(max-width: 1023px)';

/** Les deux lectures de la fiche (plan fournée v3, §4.1). */
type WorkshopView = 'product' | 'slot';

const VIEW_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'product', label: 'Par produit' },
  { value: 'slot', label: 'Par tranche' },
];

/** Combien de temps « Annuler la dernière » reste offert (plan fournée v3, §4.5). */
const UNDO_MS = 8000;

/** La ligne attend-elle le four pour une commande ? (le point ambre de l'onglet) */
function presses(line: WorkshopLine): boolean {
  return !line.done && (line.waitingOrders ?? null) !== null;
}

/**
 * **La fiche d'atelier** — ce que le fournil a à sortir, et ce qui est sorti.
 *
 * Aucun prix, aucun nom de client, aucun total en euros : ce n'est pas une
 * omission, c'est la règle qui définit cet écran, et le contrat la porte dans le
 * TYPE plutôt qu'en consigne — il n'y a pas de champ à laisser vide.
 *
 * 🔴 **L'écran ne calcule rien** (décidé le 2026-09-14,
 * `documentation/fournil/plan-fiche-atelier.md` §10). La journée, les rayons,
 * les deux listes et tous les comptes viennent du serveur ; l'écran relit après
 * chaque fournée acceptée.
 *
 * **Trois responsabilités, trois fichiers**, comme le poste de colisage :
 * - {@link WorkshopDayReader} — CE QU'ON LIT : la journée, les relectures,
 *   les lignes en vol ;
 * - {@link WorkshopGestures} — CE QU'ON FAIT : déclarer, annuler, retirer ;
 * - **ce composant — LE CHOIX DE LA FICHE** et sa mise en forme : onglets, rang,
 *   bloc replié du téléphone.
 *
 * **La catégorie ouverte suit la PERSONNE**, dans `nav_prefs` et non dans
 * `localStorage` : le téléphone du pétrin n'est pas la machine du chef, et c'est
 * la personne qui reprend son poste. Un `PATCH` refusé laisse simplement la
 * catégorie à la session.
 */
@Component({
  selector: 'app-fiche-atelier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WorkshopWallClock,
    DriftBanner,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSurfaceDirective,
    FoldToastComponent,
    FoldTabsComponent,
    FoldViewToggleComponent,
    WorksheetLine,
    WorksheetSlots,
  ],
  // Fournis ICI, pas à la racine : un poste ouvert deux fois ne partage ni sa
  // lecture ni ses envois.
  providers: [
    WorkshopDayReader,
    WorkshopGestures,
    WorkshopShortcutsReader,
    WorkshopClock,
    WorkshopKeypadOpener,
  ],
  templateUrl: './fiche-atelier.html',
  styleUrl: './fiche-atelier.scss',
})
export class FicheAtelier {
  protected readonly day = inject(WorkshopDayReader);
  protected readonly gestures = inject(WorkshopGestures);
  /** « Maintenant », en minutes, mis à jour chaque minute — les paliers en retard. */
  protected readonly now = inject(WorkshopClock).minutes;
  private readonly keypad = inject(WorkshopKeypadOpener);
  /** Les raccourcis « + 1 plaque (24) », lus une fois pour toute la fiche (S2). */
  protected readonly shortcuts = inject(WorkshopShortcutsReader);
  private readonly prefs = inject(StaffPrefsService);

  protected readonly compact = narrowViewport(WORKSHOP_NARROW);

  /** Par produit, ou par tranche — dans le rayon courant. */
  protected readonly view = signal<WorkshopView>('product');
  protected readonly viewOptions = VIEW_OPTIONS;
  protected readonly undoMs = UNDO_MS;

  /** Le bloc des lignes faites, sur téléphone. Replié : on vient voir ce qui reste. */
  protected readonly doneOpen = signal(false);

  /** La fiche choisie. `null` tant que rien n'a été lu ni préféré. */
  private readonly chosen = signal<string | null>(null);

  constructor() {
    // 🔴 Une lecture UNIQUE, et pas un `effect` : la journée est choisie au
    // serveur, rien à l'écran ne la fait changer.
    void this.day.load();
    void this.shortcuts.load();
    // Les autres postes déclarent aussi : sans relecture, une ligne sortie du four
    // par le voisin resterait « à faire » ici, et on la fabriquerait deux fois.
    // Elle ne relit que si la journée du fournil a bougé (`plan-version-par-journee.md`).
    inject(DayVersionWatcher).watch({
      journals: ['production'],
      date: this.day.date,
      // Les paliers arrivent avec la ligne : relire la fiche suffit.
      reload: () => this.day.refresh(),
      clockDay: () => isoDay(new Date()),
    });
    // La préférence n'arrive pas avant la personne : `GET /admin/me` est déjà en
    // vol pour les droits. Si elle n'arrive jamais, la première fiche suffit.
    void this.prefs.worksheetCategory().then((category) => {
      if (category !== null && this.chosen() === null) {
        this.chosen.set(category);
      }
    });
  }

  /** La fiche affichée : celle qu'on a choisie, ou la première s'il n'y a pas de choix. */
  protected readonly current = computed<WorkshopGroup | null>(() => {
    const groups = this.day.groups();
    const key = this.chosen();
    return groups.find((group) => group.key === key) ?? groups[0] ?? null;
  });

  /** Le rang de la fiche dans la liste servie — « fiche 2 sur 5 ». */
  protected readonly rank = computed(() => {
    const current = this.current();
    return current === null ? 0 : this.day.groups().indexOf(current) + 1;
  });

  /** Les onglets du poste fixe : le rayon et son avancement, tels que servis. */
  protected readonly tabs = computed<readonly FoldTabItem[]>(() =>
    this.day.groups().map((group) => ({
      key: group.key,
      label: group.label,
      badge: `${group.doneCount}/${group.lineCount}`,
      // Ce qui presse : un point ambre, et les mots sur la ligne elle-même.
      ...(group.lines.some(presses)
        ? { dot: 'warning' as const, dotLabel: 'une commande attend le four' }
        : {}),
    })),
  );

  /** Le même choix, sous le pouce : une liste, jamais six onglets de 390 px. */
  protected readonly tabOptions = computed<readonly FoldSelectItem<string>[]>(() =>
    this.day.groups().map((group) => ({
      value: group.key,
      label: `${group.label} · ${String(group.remainingUnits)} à sortir`,
    })),
  );

  /** Toutes les lignes de la fiche, dans l'ordre servi — le poste fixe. */
  protected readonly lines = computed(() => this.current()?.lines ?? []);

  /** Ce qui reste à sortir, tel que servi — le téléphone. */
  protected readonly todo = computed(() => this.current()?.pending ?? []);

  /** Les lignes complètes, telles que servies — sur téléphone, dans le bloc replié du pied. */
  protected readonly done = computed(() => this.current()?.done ?? []);

  /** Les SKU dont un geste est en vol — la vue par tranche les désarme. */
  protected readonly busySkus = computed<ReadonlySet<string>>(
    () =>
      new Set(
        this.lines()
          .filter((line) => this.gestures.isBusy(line))
          .map((l) => l.sku),
      ),
  );

  /** La dernière fournée, en liste : une nouvelle remonte le bandeau et son compte à rebours. */
  protected readonly lastBatch = computed(() => {
    const last = this.gestures.last();
    return last === null ? [] : [last];
  });

  protected chooseView(value: string): void {
    this.view.set(value === 'slot' ? 'slot' : 'product');
  }

  /**
   * « Saisir » depuis une tranche : la fiche bascule en vue produit, et le pavé
   * s'ouvre sur la ligne, prérempli du manque du palier (SPEC v3 §4).
   */
  protected async enterFromSlot(entry: SlotEntry): Promise<void> {
    this.view.set('product');
    const quantity = await this.keypad.openFor(
      entry.line,
      entry.preset,
      this.shortcuts.bySku().get(entry.line.sku) ?? [],
    );
    if (quantity !== null) {
      await this.gestures.record(entry.line, quantity);
    }
  }

  /** Change de fiche, et le retient pour la personne. */
  protected choose(key: string): void {
    this.chosen.set(key);
    this.doneOpen.set(false);
    void this.prefs.remember({ worksheetCategory: key });
  }

  protected toggleDone(): void {
    this.doneOpen.update((open) => !open);
  }
}
