import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSearchComponent,
  FoldSurfaceDirective,
} from 'fold-ng';

import type { PackingSheet, ProductionPackingView } from '@lfd/contracts';

import { methodLabel, type PackingStack } from '../packing-board';
import { isoDay } from '../worksheet-day';
import { PermissionsStore } from '../../auth/permissions.store';
import { DayVersionWatcher } from '../../shared/day-version/day-version-watcher';
import type { DayJournal } from '../../shared/day-version/day-version.service';
import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import { PackingDayReader } from './packing-day.reader';
import { PackingGestures } from './packing-gestures';
import { PackingOpenOrder } from './packing-open-order/packing-open-order';
import { PackingOrders } from './packing-orders/packing-orders';
import { PackingResources } from './packing-resources/packing-resources';
import { PackingRoundsReader } from './packing-rounds.reader';
import { sheetsInRoundOrder } from './packing-rounds';
import { foundOnlyElsewhere, hitLinesByOrder, normaliseTerm, searchHits } from './packing-search';

/**
 * **Le poste de colisage** — répartir ce qui est sorti du four dans les bacs.
 *
 * Jumeau de la fiche d'atelier, et pas son doublon : la fiche a pour clé le
 * RAYON et répond à « qu'est-ce qu'on sort du four » ; ici la clé est la
 * **commande**, et la question est « ce bac est-il complet ».
 *
 * **Une balance, pas une liste de cases** : la commande ouverte et la
 * marchandise à répartir sont à l'écran en même temps. 🔴 Un reste négatif se
 * voit tel quel — c'est le cas que ce poste existe pour attraper.
 *
 * 🔴 **L'écran n'additionne rien** (décidé le 2026-09-14). Tout chiffre et toute
 * règle affichés viennent du serveur, et l'écran relit après chaque geste
 * accepté. La seule chose gardée n'est pas un chiffre : le choix de ce que la
 * recherche surligne.
 *
 * **Quatre responsabilités, quatre fichiers** (découpé le 2026-09-14) :
 * - {@link PackingDayReader} — CE QU'ON LIT : la journée et ses relectures ;
 * - {@link PackingGestures} — CE QU'ON FAIT : déclarer prête, rouvrir, avec
 *   leurs envois et leurs échecs ;
 * - `packing-search.ts` — ce que la recherche désigne, en fonctions pures ;
 * - **ce composant — LA NAVIGATION** : la commande et la pile choisies, le QR,
 *   les avis qui disent ce qui vient de se passer, et les projections pour les
 *   trois colonnes ({@link PackingOrders}, {@link PackingOpenOrder},
 *   {@link PackingResources}). Il **réagit** aux gestes et aux relectures, il ne
 *   les fait pas.
 *
 * ⚠️ **« Prête » à l'écran, `packed` dans le code, et c'est voulu.** Le serveur
 * publie `OrderPackedEvent` — « colisé » — et le commerce en tire `ready`. Un
 * colis fait n'est pas toujours remettable : l'écran nomme l'EFFET, les
 * identifiants suivent le FAIT. Personne ne doit renommer l'événement pour
 * « aligner » les deux (écrit le 2026-09-13, à la demande de l'exploitant).
 */
/** La largeur où la bande tient sur une ligne — la même que `colisage.scss`. */
const COMPACT_MASTHEAD_QUERY = '(max-width: 1366px)';

@Component({
  selector: 'app-colisage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSearchComponent,
    FoldSurfaceDirective,
    PackingOpenOrder,
    PackingOrders,
    PackingResources,
    RouterLink,
  ],
  // Fournis ICI, pas à la racine : un poste ouvert deux fois ne partage ni sa
  // lecture ni ses envois.
  providers: [PackingDayReader, PackingGestures, PackingRoundsReader],
  templateUrl: './colisage.html',
  styleUrl: './colisage.scss',
})
export class Colisage {
  protected readonly day = inject(PackingDayReader);
  private readonly permissions = inject(PermissionsStore);
  protected readonly gestures = inject(PackingGestures);
  /** Les tournées du jour, lues côté livraison (lot PC2) : l'ORDRE de la liste. */
  protected readonly rounds = inject(PackingRoundsReader);

  /**
   * Le bac à ouvrir, quand on arrive par le QR d'une feuille d'atelier
   * (`/colisage/:reference`). Absent depuis le rail, où l'on ouvre la liste.
   */
  readonly reference = input<string>();

  /** La commande ouverte. `null` = celle du haut de la pile affichée. */
  private readonly chosen = signal<string | null>(null);

  /**
   * **La pile affichée à gauche.** « En cours » par défaut : c'est ce qui reste
   * à faire.
   *
   * ⚠️ **Ce sélecteur FILTRE, là où la recherche SURLIGNE**, et les deux
   * cohabitent : choisir une pile n'est pas cacher un résultat. Le malentendu —
   * croire qu'un article n'est nulle part — est fermé par {@link onlyElsewhere}.
   */
  protected readonly stack = signal<PackingStack>('todo');

  /**
   * La commande qu'on vient de déclarer prête, le temps de le dire. C'est le
   * moment le plus fréquent de la journée : sans cette phrase, on verrait un autre
   * client apparaître et on douterait d'avoir cliqué.
   */
  protected readonly justDeclared = signal<string | null>(null);

  /**
   * La référence de l'URL a-t-elle déjà été honorée ? Une seule fois : le QR
   * désigne un point d'entrée, pas un attachement. Sans ce drapeau, la relecture
   * qui suit une déclaration rouvrirait la commande qu'on vient de finir.
   */
  private routeApplied = false;

  /**
   * La référence demandée par l'URL et absente de la journée ouverte. Elle se DIT
   * en toutes lettres : un QR d'hier ouvre exactement ce cas.
   */
  protected readonly unknownReference = signal<string | null>(null);

  /**
   * La commande ouverte ICI qu'un **autre poste** vient de déclarer prête. La
   * relecture la range dans les prêtes et l'écran enchaîne sous les doigts de
   * quelqu'un qui n'a rien cliqué : sans cette phrase, on croirait l'avoir perdue.
   */
  protected readonly closedElsewhere = signal<string | null>(null);

  /**
   * **La liste des commandes, repliée** — tablette seulement (≤ 1366 px) :
   * au-dessus, la feuille de style l'ignore et la colonne reste ouverte. Repliée
   * à l'ouverture et après chaque choix, pour rendre la largeur aux Produits et
   * aux Contenants, entre lesquels on glisse (2026-10-05, Hugo).
   */
  protected readonly ordersFolded = signal(true);

  /**
   * Le reste de la journée par SKU, tel que servi : une table de recherche pour
   * l'écrire sous chaque ligne sur tablette, où la colonne de droite n'est pas
   * rendue. Aucun calcul — `remaining` vient du serveur.
   */
  protected readonly stockBySku = computed<ReadonlyMap<string, number>>(
    () => new Map(this.day.resources().map((item) => [item.sku, item.remaining])),
  );

  /**
   * Tablette et mobile (≤ 1366 px) : la recherche partage la ligne de la bande,
   * et la phrase longue n'y tient pas — « Recherche » seul (2026-10-05, Hugo).
   */
  protected readonly compactMasthead = narrowViewport(COMPACT_MASTHEAD_QUERY);

  /** Le terme cherché. Il SURLIGNE, il ne filtre pas — voir `packing-search.ts`. */
  protected readonly term = signal('');

  private readonly normalised = computed(() => normaliseTerm(this.term()));

  /** Une recherche est-elle en cours ? Elle met le reste de la journée en retrait. */
  protected readonly searching = computed(() => this.normalised() !== '');

  constructor() {
    // 🔴 Une lecture UNIQUE, et pas un `effect` sur la journée : le seul à écrire
    // la date est la lecture elle-même, et un effet qui la lirait se rappellerait
    // après chaque lecture.
    void this.load();
    // 🔴 Enregistrée par l'ÉCRAN, pas par le lecteur : c'est l'écran qui sait
    // quelle commande est ouverte, et qui compare avant et après.
    // Seulement si la journée du fournil a bougé (`plan-version-par-journee.md`).
    // La journée de la LIVRAISON aussi (2026-10-02) : une tournée recomposée
    // range la pile autrement, et sans elle le filet de 5 min seul la voyait.
    // Seulement si le poste peut la lire — sa porte ne s'ouvre pas au colisage.
    inject(DayVersionWatcher).watch({
      journals: this.watchedJournals(),
      date: this.day.date,
      reload: () => this.refresh(),
      clockDay: () => isoDay(new Date()),
    });
  }

  private watchedJournals(): readonly DayJournal[] {
    const deliveryReadable =
      this.permissions.can('delivery_rounds:read') || this.permissions.can('delivery_loading:read');
    return deliveryReadable ? ['production', 'delivery'] : ['production'];
  }

  /** Ce qui reste à faire. Un tri de la pile, pas un compte. */
  protected readonly todoSheets = computed(() =>
    this.day.sheets().filter((sheet) => sheet.packedAt === null),
  );

  /** Ce qui est déclaré prêt. */
  protected readonly readySheets = computed(() =>
    this.day.sheets().filter((sheet) => sheet.packedAt !== null),
  );

  /**
   * La pile affichée à gauche, **rangée par tournée, du dernier arrêt au
   * premier** (lot PC2) — un ordre d'affichage : la tête de pile, celle qui
   * s'ouvre d'elle-même, est le dernier arrêt de la première tournée.
   */
  protected readonly visibleSheets = computed(() =>
    sheetsInRoundOrder(
      this.stack() === 'todo' ? this.todoSheets() : this.readySheets(),
      this.rounds.rounds(),
    ),
  );

  private readonly otherSheets = computed(() =>
    this.stack() === 'todo' ? this.readySheets() : this.todoSheets(),
  );

  /** Le nom de l'autre pile, pour le dire en toutes lettres. */
  protected readonly otherStackLabel = computed(() =>
    this.stack() === 'todo' ? 'prêtes' : 'en cours',
  );

  /**
   * La commande ouverte : celle qu'on a choisie, ou la première de la pile.
   *
   * 🔴 Cherchée dans la pile AFFICHÉE, jamais dans la journée entière : c'est ce
   * qui fait qu'une commande déclarée prête quitte l'écran sous les doigts et
   * laisse la suivante à sa place.
   */
  protected readonly current = computed<PackingSheet | null>(() => {
    const sheets = this.visibleSheets();
    const key = this.chosen();
    return sheets.find((sheet) => sheet.reference === key) ?? sheets[0] ?? null;
  });

  /** Les SKU désignés — un seul ensemble pour les trois colonnes. */
  protected readonly hits = computed(() =>
    searchHits(this.normalised(), this.day.sheets(), this.day.resources()),
  );

  /** Les lignes trouvées de chaque commande, telles que servies, jamais additionnées. */
  protected readonly hitLinesByOrder = computed(() =>
    hitLinesByOrder(this.hits(), this.day.sheets()),
  );

  /** Le terme ne désigne rien de la journée : on le DIT plutôt que de ne rien changer. */
  protected readonly noHit = computed(() => this.searching() && this.hits().size === 0);

  /** 🔴 Rien dans la pile affichée, mais quelque chose dans l'autre — sans compter. */
  protected readonly onlyElsewhere = computed(
    () =>
      this.searching() &&
      foundOnlyElsewhere(this.hitLinesByOrder(), this.visibleSheets(), this.otherSheets()),
  );

  /**
   * « Déclarer prête pour le retrait » / « … pour la livraison ». Le mode est DANS
   * le libellé, et « retrait » sur une commande livrée serait faux : le lexique
   * réserve `pickup` au mode d'acheminement.
   */
  protected readonly readyLabel = computed(() => {
    const sheet = this.current();
    if (sheet === null) {
      return 'Déclarer prête';
    }
    return sheet.fulfillmentMethod === 'pickup'
      ? 'Déclarer prête pour le retrait'
      : 'Déclarer prête pour la livraison';
  });

  /** La lecture initiale — et « Réessayer ». Elle ouvre ensuite la commande du QR. */
  protected async load(): Promise<void> {
    this.gestures.forgetOrderFailures();
    const served = await this.day.load();
    if (served !== null) {
      await this.rounds.load(served.date);
      this.openAsked(served);
    }
  }

  /**
   * La relecture périodique, vue de l'écran : sautée pendant une déclaration (qui
   * relit elle-même au retour), puis la commande ouverte avant et après.
   */
  private async refresh(): Promise<void> {
    if (this.gestures.closing()) {
      return;
    }
    const openBefore = this.current();
    if (await this.day.refresh()) {
      await this.rounds.load(this.day.date());
      this.noticeClosedElsewhere(openBefore);
    }
  }

  /**
   * Ouvre la commande que l'URL désigne, s'il y en a une.
   *
   * ⚠️ `reference()` n'est lu qu'ICI, après l'attente de la lecture : le routeur
   * lie ses entrées juste après la création du composant.
   */
  private openAsked(served: ProductionPackingView): void {
    const asked = this.reference();
    if (asked === undefined || this.routeApplied) {
      return;
    }
    this.routeApplied = true;
    const found = served.sheets.find((sheet) => sheet.reference === asked);
    this.unknownReference.set(found === undefined ? asked : null);
    this.chosen.set(found?.reference ?? null);
    // Une feuille rescannée peut désigner une commande DÉJÀ prête : l'ouvrir sans
    // basculer de pile montrerait une commande absente de sa propre liste.
    if (found?.packedAt != null) {
      this.stack.set('ready');
    }
  }

  /** La commande qu'on avait sous les yeux est-elle passée prête ailleurs ? Depuis « en cours » seulement. */
  private noticeClosedElsewhere(openBefore: PackingSheet | null): void {
    if (openBefore === null || openBefore.packedAt !== null || this.stack() !== 'todo') {
      return;
    }
    const now = this.day.sheets().find((sheet) => sheet.reference === openBefore.reference);
    if (now?.packedAt != null) {
      this.closedElsewhere.set(openBefore.customerLabel);
      this.chosen.set(null);
    }
  }

  protected acknowledgeClosedElsewhere(): void {
    this.closedElsewhere.set(null);
  }

  /** Ouvre une commande. Un échec ne se traîne pas d'une commande à l'autre. */
  protected choose(reference: string): void {
    this.chosen.set(reference);
    this.unknownReference.set(null);
    this.gestures.forgetOrderFailures();
    this.justDeclared.set(null);
    this.closedElsewhere.set(null);
    this.ordersFolded.set(true);
  }

  /** Replie ou rouvre la liste des commandes (tablette). */
  protected toggleOrders(): void {
    this.ordersFolded.update((folded) => !folded);
  }

  /** Change de pile. Le choix courant retombe sur la tête de la nouvelle pile. */
  protected chooseStack(stack: PackingStack): void {
    this.stack.set(stack);
    this.chosen.set(null);
    this.justDeclared.set(null);
  }

  /** Vide la recherche — le `×` du champ et la touche Échap font le même geste. */
  protected clearTerm(): void {
    this.term.set('');
  }

  /**
   * « Déclarer prête » sur la commande ouverte — puis l'écran **réagit**.
   *
   * 🔴 **ON ENCHAÎNE.** Acceptée, la commande quitte la pile « en cours » sous les
   * doigts : oublier le choix fait retomber {@link current} sur la suivante. Sans
   * ça, l'écran resterait sur une référence absente de sa propre liste — au
   * moment le plus fréquent de la journée.
   */
  protected async declareCurrent(): Promise<void> {
    const sheet = this.current();
    if (sheet === null || !this.gestures.canDeclare(sheet)) {
      return;
    }
    this.justDeclared.set(null);
    if (await this.gestures.declare(sheet)) {
      void this.rounds.load(this.day.date());
      this.chosen.set(null);
      this.justDeclared.set(sheet.customerLabel);
    }
  }

  /**
   * « Rouvrir » sur une commande déclarée prête : le RANGEMENT seulement — elle
   * reste prête au commerce. Acceptée, elle revient dans « en cours », et
   * l'écran la suit là-bas pour qu'on puisse reprendre ses contenants.
   */
  protected async reopenCurrent(): Promise<void> {
    const sheet = this.current();
    if (sheet === null || sheet.packedAt === null) {
      return;
    }
    this.justDeclared.set(null);
    if (await this.gestures.reopen(sheet)) {
      this.stack.set('todo');
      this.chosen.set(sheet.reference);
    }
  }

  protected method(sheet: PackingSheet): string {
    return methodLabel(sheet.fulfillmentMethod);
  }
}
