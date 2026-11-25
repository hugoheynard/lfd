import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
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
} from 'fold-ng';

import { ActivatedRoute, Router } from '@angular/router';
import {
  WORKSTATION_GROUP_KEY_PREFIX,
  type WorkshopGroup,
  type WorkshopLine,
} from '@lfd/contracts';

import { StaffPrefsService } from '../../../shared/staff-prefs/staff-prefs.service';
import { narrowViewport } from '../../../shared/viewport/narrow-viewport';
import { VersionWatcher } from '../../../shared/version/version-watcher';
import { dayLabelOf, isoDay } from '../../worksheet-day';
import { WorkshopNotices } from '../workshop-notices/workshop-notices';
import { WorkshopDayReader } from '../state/workshop-day.reader';
import { WorkshopGestures } from '../state/workshop-gestures';
import { WorkshopOutbox } from '../outbox/workshop-outbox';
import { WorkshopQueueReplay } from '../outbox/workshop-queue-replay';
import { WorkshopClock } from '../state/workshop-clock';
import { WorkshopKeypadOpener } from '../openers/workshop-keypad-opener';
import { WorkshopShortcutsReader } from '../state/workshop-shortcuts.reader';
import { WorkshopProblemOpener } from '../openers/workshop-problem-opener';
import { keepScreenAwake } from '../../../shared/screen-awake/screen-awake';
import { WorkshopLineView } from '../workshop-line/workshop-line';
import { groupOptions, groupTabs, intertitlesOf } from '../rules/workshop-tabs';
import { type WorkshopRow, workshopRows } from '../rules/workshop-rows';
import { revealLineOnce } from '../openers/workshop-reveal-line';
import {
  groupKeyOfLine,
  linkedElsewhereDay,
  linkedSkuOf,
  pickGroup,
} from '../rules/workshop-selection';
import { type SlotEntry, WorksheetSlots } from '../worksheet-slots/worksheet-slots';
import { UNDO_MS, VIEW_OPTIONS, WORKSHOP_NARROW, type WorkshopView } from '../rules/workshop-view';
import { WorkshopWallClock } from '../workshop-wall-clock/workshop-wall-clock';
import { SaleQuantityPipe } from '../../../shared/sale-quantity/sale-quantity.pipe';

/**
 * **La fiche d'atelier** — ce que le fournil a à sortir, et ce qui est sorti.
 *
 * Aucun prix, aucun nom de client, aucun total en euros : ce n'est pas une
 * omission, c'est la règle qui définit cet écran, et le contrat la porte dans le
 * TYPE plutôt qu'en consigne — il n'y a pas de champ à laisser vide.
 *
 * 🔴 **L'écran ne calcule rien** (décidé le 2026-09-14,
 * `documentation/fournil/la-fiche-d-atelier.md` §10). La journée, les rayons,
 * les deux listes et tous les comptes viennent du serveur ; l'écran relit après
 * chaque fournée acceptée.
 *
 * **Ce composant choisit la fiche et la met en page**, rien d'autre :
 * {@link WorkshopDayReader} lit, {@link WorkshopGestures} agit,
 * {@link WorkshopQueueReplay} renvoie ce qui est resté sans réseau.
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
    SaleQuantityPipe,
    WorkshopWallClock,
    WorkshopNotices,
    FoldButtonComponent,
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
    WorkshopLineView,
    WorksheetSlots,
  ],
  // Fournis ICI, pas à la racine : un poste ouvert deux fois ne partage ni sa
  // lecture ni ses envois.
  providers: [
    WorkshopDayReader,
    WorkshopGestures,
    WorkshopOutbox,
    WorkshopQueueReplay,
    WorkshopShortcutsReader,
    WorkshopClock,
    WorkshopKeypadOpener,
    WorkshopProblemOpener,
  ],
  templateUrl: './fiche-atelier-page.html',
  styleUrl: './fiche-atelier-page.scss',
})
export class FicheAtelier {
  protected readonly day = inject(WorkshopDayReader);
  protected readonly gestures = inject(WorkshopGestures);
  /** Les fournées en route d'une ligne : la pastille « envoi… » / « en attente ». */
  private readonly outbox = inject(WorkshopOutbox);
  /** Les fournées gardées sans réseau, et leur renvoi. */
  private readonly queue = inject(WorkshopQueueReplay);
  /** « Maintenant », en minutes, mis à jour chaque minute — les paliers en retard. */
  protected readonly now = inject(WorkshopClock).minutes;
  private readonly keypad = inject(WorkshopKeypadOpener);
  /** Les raccourcis « + 1 plaque (24) », lus une fois pour toute la fiche (S2). */
  private readonly shortcuts = inject(WorkshopShortcutsReader);
  private readonly prefs = inject(StaffPrefsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly compact = narrowViewport(WORKSHOP_NARROW);

  /**
   * Par tranche, ou par produit — dans le rayon courant. La fiche s'ouvre **par
   * tranche**, la lecture du four : ce qui presse, heure par heure. Un lien de
   * la cloche qui désigne une ligne l'ouvre **par produit**, seule vue qui sait
   * la montrer et la cercler. Le choix de la personne tient ensuite.
   */
  protected readonly view = linkedSignal<boolean, WorkshopView>({
    source: () => this.linkedSku() !== null,
    computation: (linked) => (linked ? 'product' : 'slot'),
  });
  protected readonly viewOptions = VIEW_OPTIONS;
  protected readonly undoMs = UNDO_MS;

  /** Le bloc des lignes faites, sur téléphone. Replié : on vient voir ce qui reste. */
  protected readonly doneOpen = signal(false);

  /** `/fournil?poste=<id>` : la fiche d'un poste, demandée par l'adresse. */
  readonly workstationParam = input<string | undefined>(undefined, { alias: 'poste' });

  /**
   * `/fournil?jour=<jour>&ligne=<sku>` : le lien de la cloche d'un rouge (plan
   * des niveaux de suivi, § 3.8). La fiche ouvre la fiche qui porte la ligne et
   * la montre — si la journée lue est celle du lien.
   */
  readonly dayParam = input<string | undefined>(undefined, { alias: 'jour' });
  readonly lineParam = input<string | undefined>(undefined, { alias: 'ligne' });

  /** La ligne que le lien désigne, sur la journée lue ; `null` sinon. */
  protected readonly linkedSku = computed(() =>
    linkedSkuOf(this.lineParam(), this.dayParam(), this.day.date()),
  );

  /** « samedi 16 août » quand le lien vise une autre journée que celle lue. */
  protected readonly linkedElsewhere = computed(() => {
    const day = linkedElsewhereDay(this.dayParam(), this.day.date());
    return day === null ? null : dayLabelOf(day);
  });

  /** La fiche qui porte la ligne du lien. */
  private readonly linkedKey = computed(() => groupKeyOfLine(this.day.groups(), this.linkedSku()));

  /** La fiche choisie à l'écran pendant la session. */
  private readonly chosen = signal<string | null>(null);
  /** La dernière fiche ouverte par la personne (`nav_prefs.worksheetCategory`). */
  private readonly remembered = signal<string | null>(null);
  /** La clé de la fiche que l'adresse demande. */
  private readonly asked = computed(() => {
    const id = this.workstationParam();
    return id === undefined || id === '' ? null : `${WORKSTATION_GROUP_KEY_PREFIX}${id}`;
  });

  constructor() {
    // Une tablette posée au four ne se met pas en veille pendant le service.
    keepScreenAwake();
    // 🔴 Une lecture UNIQUE, et pas un `effect` : la journée est choisie au
    // serveur, rien à l'écran ne la fait changer.
    void this.day.load();
    void this.shortcuts.load();
    // Les fournées gardées sur l'appareil repartent dès que le réseau revient.
    this.queue.start();
    // Les autres postes déclarent aussi : sans relecture, une ligne sortie du four
    // par le voisin resterait « à faire » ici, et on la fabriquerait deux fois.
    // Elle ne relit que si la journée du fournil a bougé (`version-par-journee.md`).
    inject(VersionWatcher).watch({
      subjects: ['production', 'orders'],
      date: this.day.date,
      // Les paliers arrivent avec la ligne : relire la fiche suffit.
      reload: () => this.day.refresh(),
      clockDay: () => isoDay(new Date()),
    });
    revealLineOnce(
      this.linkedSku,
      computed(() => this.linkedKey() !== null),
    );
    // La préférence n'arrive pas avant la personne : `GET /admin/me` est déjà en
    // vol pour les droits. Si elle n'arrive jamais, la première fiche suffit.
    void this.prefs.worksheetCategory().then((category) => this.remembered.set(category));
  }

  /** La fiche affichée : celle qu'on a choisie, ou la première s'il n'y a pas de choix. */
  protected readonly current = computed<WorkshopGroup | null>(() =>
    pickGroup(this.day.groups(), [
      this.chosen(),
      this.linkedKey(),
      this.asked(),
      this.remembered(),
    ]),
  );

  /** Le nom du poste de la fiche ouverte (mode prod) ; `null` pour un rayon. */
  protected readonly workstationName = computed(() => this.current()?.workstation?.name ?? null);

  /** Le poste de la fiche ouverte : celui dont une ligne d'étape est l'étape. */
  protected readonly workstationId = computed(() => this.current()?.workstation?.id ?? null);

  /** Les postes des fiches du jour, par id — pour nommer les étapes qui attendent. */
  private readonly stationNames = computed<ReadonlyMap<string, string>>(
    () =>
      new Map(
        this.day
          .groups()
          .flatMap((group) =>
            group.workstation == null ? [] : [[group.workstation.id, group.workstation.name]],
          ),
      ),
  );

  /** Le rang de la fiche dans la liste servie — « fiche 2 sur 5 ». */
  protected readonly rank = computed(() => {
    const current = this.current();
    return current === null ? 0 : this.day.groups().indexOf(current) + 1;
  });

  protected readonly tabs = computed(() => groupTabs(this.day.groups()));
  protected readonly tabOptions = computed(() => groupOptions(this.day.groups()));

  /** Toutes les lignes de la fiche, dans l'ordre servi — la tablette. */
  protected readonly lines = computed(() => this.current()?.lines ?? []);

  /** Ce qui reste à sortir, tel que servi — le téléphone. */
  protected readonly todo = computed(() => this.current()?.pending ?? []);

  /** Les lignes complètes, telles que servies — sur téléphone, dans le bloc replié du pied. */
  protected readonly done = computed(() => this.current()?.done ?? []);

  /**
   * Les rangées de la liste affichée (la tablette : toutes ; le téléphone : à
   * faire), avec leurs intertitres de sous-catégorie, posés à chaque changement
   * dans CETTE liste — au téléphone, une section dont la première ligne est
   * faite garde son intertitre sur la suivante.
   */
  protected readonly rows = computed(() =>
    this.rowsOf(this.compact() ? this.todo() : this.lines()),
  );

  /** Les mêmes, dans le bloc replié des lignes faites. */
  protected readonly doneRows = computed(() => this.rowsOf(this.done()));

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

  /**
   * Change de fiche, le retient pour la personne, et l'adresse le suit : une
   * fiche de poste pose `?poste=<id>`, un rayon le retire. Sans recharger ni
   * empiler l'historique (`replaceUrl`) — l'adresse copiée ouvre la fiche vue.
   */
  protected choose(key: string): void {
    this.chosen.set(key);
    this.doneOpen.set(false);
    void this.prefs.remember({ worksheetCategory: key });
    const poste = key.startsWith(WORKSTATION_GROUP_KEY_PREFIX)
      ? key.slice(WORKSTATION_GROUP_KEY_PREFIX.length)
      : null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { poste },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private rowsOf(lines: readonly WorkshopLine[]): readonly WorkshopRow[] {
    const date = this.day.date();
    return workshopRows(lines, {
      intertitles: intertitlesOf(this.current(), lines),
      isBusy: (line) => this.gestures.isBusy(line),
      pendingOf: (sku) => this.outbox.pendingOf(date, sku),
      doneWaiting: (sku) => this.outbox.doneWaiting(date, sku),
      shortcuts: this.shortcuts.bySku(),
      linkedSku: this.linkedSku(),
      stationNames: this.stationNames(),
    });
  }

  /** Les gestes d'une étape visent le poste de la fiche ouverte. */
  protected stepDone(line: WorkshopLine): void {
    const station = this.workstationId();
    if (station !== null) void this.gestures.markStepDone(line, station);
  }

  protected stepRed(line: WorkshopLine): void {
    const station = this.workstationId();
    if (station !== null) void this.gestures.reportStepRed(line, station);
  }

  protected stepUndone(line: WorkshopLine): void {
    const station = this.workstationId();
    if (station !== null) void this.gestures.undoStep(line, station);
  }

  protected toggleDone(): void {
    this.doneOpen.update((open) => !open);
  }
}
