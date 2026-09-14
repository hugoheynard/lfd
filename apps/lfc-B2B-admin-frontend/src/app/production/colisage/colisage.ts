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

import type {
  PackingContainerStep,
  PackingLine,
  PackingSheet,
  ProductionPackingView,
} from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import {
  matchesTerm,
  methodLabel,
  normaliseTerm,
  packingMarkKey,
  type PackingStack,
} from '../packing-board';
import { PackingOpenOrder, type PackingLineToggle } from './packing-open-order/packing-open-order';
import { PackingOrders } from './packing-orders/packing-orders';
import { PackingResources } from './packing-resources/packing-resources';
import { refreshWhileVisible } from '../periodic-refresh';
import { serverMessageOf } from '../server-message';
import { PackingService } from '../packing.service';
import { dayLabelOf, hourLabel, isoDay, nextDay } from '../worksheet-day';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * « aujourd'hui » / « demain » — une correspondance de MOTS, et rien d'autre.
 *
 * L'écran ne compare pas de dates : c'est le serveur qui dit où tombe la journée
 * lue (`relativeDay`), selon SON horloge. Celle d'un poste de fournil n'est pas
 * une autorité — elle dérive, elle se règle à la main, et se tromper d'un jour
 * est l'erreur la plus chère que ce poste puisse coûter.
 */
const RELATIVE_DAY_LABEL: Readonly<
  Record<NonNullable<ProductionPackingView['relativeDay']>, string>
> = {
  today: 'aujourd’hui',
  tomorrow: 'demain',
};

/**
 * **Le poste de colisage** — répartir ce qui est sorti du four dans les bacs.
 *
 * Jumeau de la fiche d'atelier, et pas son doublon : la fiche a pour clé le
 * RAYON et répond à « qu'est-ce qu'on sort du four » ; ici la clé est la
 * **commande**, et la question est « ce bac est-il complet ». Les deux lisent la
 * même journée et ne se déduisent pas l'une de l'autre.
 *
 * **Une balance, pas une liste de cases.** Les deux plateaux sont à l'écran en
 * même temps — le bac ouvert d'un côté, la ressource de l'autre — parce que
 * celui qui colise a besoin de savoir s'il reste des croissants AVANT d'en
 * mettre douze dans un bac. 🔴 Un reste négatif se voit tel quel : c'est le cas
 * que ce poste existe pour attraper, et le masquer à zéro l'effacerait.
 *
 * 🔴 **L'écran n'additionne rien** (décidé le 2026-09-14, à la demande de
 * Hugo). Tout chiffre et toute règle affichés — volume d'une commande, lignes
 * dans le bac, compteurs des piles, marchandise à répartir, « Déclarer prête »
 * actif ou non, « aujourd'hui » / « demain » — viennent du serveur, et l'écran
 * **relit après chaque geste accepté**. Deux calculs du même chiffre divergent à
 * la première règle modifiée d'un seul côté, et c'était précisément la balance
 * qui en portait le risque. Les deux seules choses gardées ici ne sont pas des
 * chiffres : l'état d'une case le temps de son envoi, et le choix de ce que la
 * recherche surligne.
 *
 * **L'orchestrateur, et lui seul** (découpé le 2026-09-14). Les trois colonnes
 * sont des composants de présentation — {@link PackingOrders},
 * {@link PackingOpenOrder}, {@link PackingResources} — qui reçoivent ce que le
 * serveur a calculé et émettent des gestes. L'état, les lectures, la relecture
 * périodique, les écritures et la recherche restent ici.
 *
 * **Deux états, un seul réversible.** Cocher une ligne est un état de travail :
 * il part tout de suite, et revient en arrière en le disant s'il est refusé.
 * Déclarer la commande prête est le fait irréversible : il échoue à l'écran et
 * se redit.
 *
 * ⚠️ **« Prête » à l'écran, `packed` dans le code, et c'est voulu.** Le serveur
 * publie `OrderPackedEvent` — « colisé », ce que le fournil a fait — et le
 * commerce en tire `ready`, « prête pour le client ». Les deux sont
 * délibérément distincts : un colis fait n'est pas toujours remettable, un bac
 * peut attendre le froid. L'écran nomme l'EFFET parce que c'est ce que
 * l'exploitant comprend ; les identifiants suivent le FAIT, parce que c'est ce
 * que la route écrit. Personne ne doit renommer l'événement pour « aligner »
 * les deux (écrit le 2026-09-13, à la demande de l'exploitant).
 */
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
  templateUrl: './colisage.html',
  styleUrl: './colisage.scss',
})
export class Colisage {
  private readonly api = inject(PackingService);
  private readonly permissions = inject(PermissionsStore);

  /**
   * Le bac à ouvrir, quand on arrive par le QR d'une feuille d'atelier
   * (`/colisage/:reference`). Absent depuis le rail, où l'on ouvre la liste.
   */
  readonly reference = input<string>();

  /**
   * La journée LUE — celle de la dernière réponse, jamais celle demandée.
   *
   * Sa valeur initiale n'est qu'un marque-place le temps de la première
   * lecture : dès qu'une réponse arrive, c'est elle qui l'écrit.
   */
  protected readonly date = signal(isoDay(new Date()));

  /** « samedi 16 août » — l'en-tête du poste. */
  protected readonly dayLabel = computed(() => dayLabelOf(this.date()));

  /**
   * « aujourd'hui » ou « demain », à côté de la date — tel que le SERVEUR le
   * dit. Vide quand il ne dit ni l'un ni l'autre : un troisième mot suggérerait
   * que le poste montre une autre journée.
   */
  protected readonly dayOffset = computed(() => {
    const relative = this.view()?.relativeDay ?? null;
    return relative === null ? '' : RELATIVE_DAY_LABEL[relative];
  });

  protected readonly state = signal<LoadState>('loading');

  private readonly view = signal<ProductionPackingView | null>(null);

  /**
   * **L'état montré d'une case le temps de son envoi**, par
   * `AAAA-MM-JJ RÉFÉRENCE SKU` — la seule chose que l'écran garde.
   *
   * Un booléen, pas un chiffre : il ne touche ni au volume, ni aux lignes dans
   * le bac, ni à la balance, qui attendent la relecture. Sans lui, un
   * `fold-checkbox` cliqué ne reviendrait pas en arrière sur un refus. Il est
   * retiré dès qu'une relecture revient.
   */
  private readonly shown = signal<ReadonlyMap<string, boolean>>(new Map());

  /** La commande ouverte. `null` = celle du haut de la pile affichée. */
  private readonly chosen = signal<string | null>(null);

  /**
   * **La pile affichée à gauche.** « En cours » par défaut : c'est ce qui reste
   * à faire, et c'est la seule question du poste tant que la journée tourne.
   *
   * ⚠️ **Ce sélecteur FILTRE, là où la recherche SURLIGNE**, et les deux
   * cohabitent sans se contredire : choisir une pile n'est pas cacher un
   * résultat, c'est ranger son travail. Le malentendu que « ça surligne, ça ne
   * filtre pas » voulait éviter — croire qu'un article n'est nulle part — est
   * fermé ailleurs, par l'avis « trouvé dans l'autre pile » sous le champ.
   */
  protected readonly stack = signal<PackingStack>('todo');

  /**
   * La commande qu'on vient de déclarer prête, le temps de le dire.
   *
   * C'est le moment le plus fréquent de la journée : la commande quitte la pile
   * « en cours » sous les doigts, et l'écran enchaîne tout seul sur la suivante.
   * Sans cette phrase, on verrait un autre client apparaître et on douterait
   * d'avoir cliqué.
   */
  protected readonly justDeclared = signal<string | null>(null);

  /**
   * La référence de l'URL a-t-elle déjà été honorée ?
   *
   * Une seule fois, au PREMIER chargement : le QR désigne un point d'entrée, pas
   * un attachement permanent. Sans ce drapeau, chaque relecture — dont celle qui
   * suit une déclaration — rouvrirait la commande scannée, c'est-à-dire celle
   * qu'on vient justement de finir.
   */
  private routeApplied = false;

  /**
   * La référence demandée par l'URL et absente de la journée ouverte.
   *
   * Elle se DIT, en toutes lettres : un QR scanné sur une feuille d'hier ouvre
   * exactement ce cas, et un écran vide laisserait croire que le bac est fait.
   */
  protected readonly unknownReference = signal<string | null>(null);

  /**
   * La déclaration vient-elle d'échouer ? Un échec partiel : la commande reste à
   * l'écran, et rien n'a été annoncé au commerce.
   */
  protected readonly closeFailed = signal(false);

  /** Une déclaration en vol, relecture comprise — le bouton se désarme pour ne pas doubler le geste. */
  protected readonly closing = signal(false);

  /** Le geste sur les containers vient-il d'être refusé ? Il se dit, il ne se tait pas. */
  protected readonly containersFailed = signal(false);

  /** Un geste sur les containers en vol : « + » et « − » se désarment, et seulement pendant ce temps. */
  protected readonly containersBusy = signal(false);

  /** Les lignes dont la coche est en train de partir — leur case est désarmée. */
  private readonly busy = signal<ReadonlySet<string>>(new Set());

  /**
   * La dernière coche refusée, avec le produit, la commande et la raison du
   * serveur. 🔴 La case est revenue en arrière : il reste à le DIRE, sinon elle
   * a l'air d'avoir bougé toute seule.
   */
  protected readonly markFailed = signal<string | null>(null);

  /**
   * L'instant de la dernière écriture acceptée — coche, containers ou
   * déclaration. Une relecture PÉRIODIQUE partie avant elle rendrait l'état
   * d'avant : sa réponse est jetée. La relecture d'après écriture, elle, part
   * après et n'y est pas soumise (voir {@link rereadAfterWrite}).
   */
  private lastWriteAt = 0;

  /** L'instant ISO de la dernière lecture réussie — le pied dit de quand date l'écran. */
  private readonly readAt = signal<string | null>(null);

  /** « 4 h 12 » — l'heure de la dernière lecture réussie. */
  protected readonly readLabel = computed(() => hourLabel(this.readAt()));

  /**
   * La dernière relecture a-t-elle échoué ? Le poste reste à l'écran, mais le
   * pied dit depuis quand il n'a pas bougé : une balance figée qui a l'air à
   * jour fait répartir deux fois la même marchandise.
   */
  protected readonly refreshFailed = signal(false);

  /**
   * La commande ouverte ICI qu'un **autre poste** vient de déclarer prête.
   *
   * 🔴 C'est le cas multiposte par excellence : la relecture la fait passer dans
   * la pile des prêtes, et l'écran enchaîne sur la suivante — sous les doigts de
   * quelqu'un qui n'a rien cliqué. Sans cette phrase, on croirait avoir perdu sa
   * commande, ou avoir déclaré la mauvaise.
   */
  protected readonly closedElsewhere = signal<string | null>(null);

  /** Le rang de la dernière lecture lancée. Une réponse lente n'écrase jamais une plus récente. */
  private readSeq = 0;

  constructor() {
    // 🔴 Une lecture UNIQUE, et pas un `effect` sur la journée. Le poste n'a pas
    // de sélecteur de date : le seul à écrire `date` est la lecture elle-même,
    // donc un effet qui la lirait se rappellerait après chaque lecture — et le
    // jour où la règle bascule d'aujourd'hui à demain, il partirait deux fois.
    void this.load();
    // Les autres postes colisent aussi : sans relecture, une commande déclarée
    // prête ailleurs resterait « en cours » ici, et la balance mentirait.
    refreshWhileVisible(() => this.refresh());
  }

  /** Les commandes de la journée, telles que servies. */
  protected readonly sheets = computed(() => this.view()?.sheets ?? []);

  /**
   * La marchandise à répartir, **pour la journée entière**, prêtes comprises,
   * et **telle que servie** : l'écran ne la recompte plus.
   *
   * Elle ne bouge pas avec le sélecteur de pile, et c'est tout le sujet : ce qui
   * est parti dans un bac reste réparti.
   */
  protected readonly resources = computed(() => this.view()?.resources ?? []);

  /** Toutes les commandes de la journée — compté au serveur. */
  protected readonly orderCount = computed(() => this.view()?.orderCount ?? 0);

  /** Celles qui restent à préparer — compté au serveur. */
  protected readonly todoCount = computed(() => this.view()?.todoCount ?? 0);

  /** Celles déclarées prêtes — compté au serveur. */
  protected readonly readyCount = computed(() => this.view()?.readyCount ?? 0);

  /** Ce qui reste à faire. Un tri de la pile, pas un compte. */
  protected readonly todoSheets = computed(() =>
    this.sheets().filter((sheet) => sheet.packedAt === null),
  );

  /** Ce qui est déclaré prêt — la pile à part, qu'on ne rouvre que pour vérifier. */
  protected readonly readySheets = computed(() =>
    this.sheets().filter((sheet) => sheet.packedAt !== null),
  );

  /** La pile affichée à gauche. */
  protected readonly visibleSheets = computed(() =>
    this.stack() === 'todo' ? this.todoSheets() : this.readySheets(),
  );

  /** La journée est-elle arrêtée ? `null` = il n'y a rien à coliser. */
  protected readonly closedAt = computed(() => this.view()?.closedAt ?? null);

  /**
   * La commande ouverte : celle qu'on a choisie, ou la première de la pile.
   *
   * 🔴 Elle se cherche dans la pile AFFICHÉE, jamais dans la journée entière :
   * c'est ce qui fait qu'une commande déclarée prête quitte l'écran sous les
   * doigts et laisse la suivante à sa place, sans un clic de plus.
   */
  protected readonly current = computed<PackingSheet | null>(() => {
    const sheets = this.visibleSheets();
    const key = this.chosen();
    return sheets.find((sheet) => sheet.reference === key) ?? sheets[0] ?? null;
  });

  /**
   * 🔴 **Le terme cherché SURLIGNE, il ne filtre pas.**
   *
   * Filtrer casserait la balance : le reste à répartir porte sur la journée
   * entière, et une liste réduite ferait lire un reste qui ne correspond à rien
   * de ce qui est affiché. La question de cet outil est « j'ai douze
   * croissants, qui les attend ? » — il faut donc voir EN MÊME TEMPS ce qui
   * reste et toutes les commandes qui en veulent.
   *
   * Le choix de ce qui est surligné reste à l'écran : c'est un filtre de texte,
   * pas un calcul. La recherche ne fait plus aucun total (retirés le 2026-09-14).
   */
  protected readonly term = signal('');

  /** Le terme réduit à ce qui se compare — minuscules, sans accents. */
  private readonly normalised = computed(() => normaliseTerm(this.term()));

  /** Une recherche est-elle en cours ? Elle met le reste de la journée en retrait. */
  protected readonly searching = computed(() => this.normalised() !== '');

  /**
   * Les SKU que le terme désigne, tirés des DEUX sources de l'écran.
   *
   * Un seul ensemble pour les trois colonnes : elles doivent se surligner
   * ensemble ou l'outil ment. Les résoudre chacune de son côté aurait laissé
   * une commande se distinguer pour un article que la marchandise ne montrerait
   * pas — et c'est justement le rapprochement des deux qu'on est venu lire.
   */
  protected readonly hits = computed<ReadonlySet<string>>(() => {
    const normalised = this.normalised();
    const skus = new Set<string>();
    if (normalised === '') {
      return skus;
    }
    for (const item of this.resources()) {
      if (matchesTerm(normalised, item.sku, item.productName)) {
        skus.add(item.sku);
      }
    }
    for (const sheet of this.sheets()) {
      for (const line of sheet.lines) {
        if (matchesTerm(normalised, line.sku, line.productName)) {
          skus.add(line.sku);
        }
      }
    }
    return skus;
  });

  /**
   * **Les lignes trouvées de chaque commande**, telles que servies, par
   * référence — seulement les commandes qui en ont.
   *
   * 🔴 Leurs quantités s'affichent une à une, JAMAIS additionnées : c'était « en
   * attend 24 », une somme faite à la frappe, donc par l'écran. On voit toujours
   * qui attend combien — plusieurs quantités si plusieurs articles répondent —
   * sans qu'aucune addition ait lieu ici. Une commande présente dans la table est
   * surlignée ; c'est un filtre de texte, pas un compte.
   */
  protected readonly hitLinesByOrder = computed<ReadonlyMap<string, readonly PackingLine[]>>(() => {
    const hits = this.hits();
    const found = new Map<string, readonly PackingLine[]>();
    if (hits.size === 0) {
      return found;
    }
    for (const sheet of this.sheets()) {
      const lines = sheet.lines.filter((line) => hits.has(line.sku));
      if (lines.length > 0) {
        found.set(sheet.reference, lines);
      }
    }
    return found;
  });

  /** Le terme ne désigne rien de la journée : on le DIT plutôt que de ne rien changer. */
  protected readonly noHit = computed(() => this.searching() && this.hits().size === 0);

  /** L'autre pile que celle affichée. */
  private readonly otherSheets = computed(() =>
    this.stack() === 'todo' ? this.readySheets() : this.todoSheets(),
  );

  /** Le nom de l'autre pile, pour le dire en toutes lettres. */
  protected readonly otherStackLabel = computed(() =>
    this.stack() === 'todo' ? 'prêtes' : 'en cours',
  );

  /**
   * 🔴 **Le terme ne trouve rien ICI, mais quelque chose dans l'autre pile.**
   *
   * Sans cet avis, le sélecteur rendrait faux ce que la recherche promet : un
   * article présent seulement dans des commandes déjà prêtes n'apparaîtrait
   * nulle part, et on conclurait qu'il n'est demandé par personne. L'avis ne
   * porte AUCUN nombre : combien de commandes serait un compte fait par l'écran.
   */
  protected readonly onlyElsewhere = computed(() => {
    const found = this.hitLinesByOrder();
    return (
      this.searching() &&
      !this.visibleSheets().some((sheet) => found.has(sheet.reference)) &&
      this.otherSheets().some((sheet) => found.has(sheet.reference))
    );
  });

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
   * 🔴 « Déclarer prête » suit **la règle du serveur** (`canDeclareReady`), et
   * rien d'autre que le geste en vol.
   *
   * L'écran décidait seul — « toutes les lignes cochées » — et le jour où la
   * règle change au serveur, il aurait proposé un geste que le serveur refuse,
   * ou caché un geste permis. Une règle est un calcul comme un autre.
   */
  protected readonly canClose = computed(() => {
    const sheet = this.current();
    return sheet !== null && sheet.canDeclareReady && !this.closing();
  });

  /**
   * « Déclarer prête pour le retrait » / « … pour la livraison ».
   *
   * Le mode d'acheminement est DANS le libellé parce que c'est la seule chose
   * qui dise au fournil ce qui va se passer ensuite — et parce que « retrait »
   * sur une commande livrée serait faux : le lexique du dépôt réserve `pickup`
   * au mode d'acheminement.
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

  /**
   * « + » et « − » s'offrent-ils ? Une commande déclarée prête ne change plus de
   * compte.
   *
   * ⚠️ Ce n'est pas une règle calculée ici, c'est la LECTURE d'un état servi
   * (`packedAt`) : le contrat ne porte pas de `canStepContainers`, et sans ce
   * garde l'écran offrirait sur une commande prête un geste que le serveur
   * refuserait (vérifié dans le contrat le 2026-09-14).
   */
  protected readonly canSetContainers = computed(() => {
    const sheet = this.current();
    return sheet !== null && sheet.packedAt === null;
  });

  protected async load(): Promise<void> {
    this.state.set('loading');
    this.closeFailed.set(false);
    this.containersFailed.set(false);
    this.readSeq += 1;
    const seq = this.readSeq;
    try {
      const served = await this.workedDay();
      if (seq !== this.readSeq) {
        return;
      }
      this.applyRead(served);
      this.openAsked(served);
      this.state.set('ready');
    } catch {
      if (seq === this.readSeq) {
        this.state.set('error');
      }
    }
  }

  /**
   * Inscrit une lecture réussie : la journée, sa date, et l'heure de lecture.
   *
   * La journée vient de la RÉPONSE, pas de la demande : `workedDay` peut rendre
   * demain là où on avait aujourd'hui, et l'en-tête doit nommer la journée qu'on
   * lit, jamais celle qu'on a demandée.
   *
   * L'état montré des cases s'efface ici — sauf celui des cases dont l'envoi est
   * encore en vol : ce que le serveur vient de relire les remplace.
   */
  private applyRead(served: ProductionPackingView): void {
    this.view.set(served);
    this.date.set(served.date);
    this.readAt.set(new Date().toISOString());
    this.refreshFailed.set(false);
    const inFlight = this.busy();
    this.shown.set(new Map([...this.shown()].filter(([key]) => inFlight.has(key))));
  }

  /**
   * Ouvre le bac que l'URL désigne, s'il y en a une.
   *
   * ⚠️ `reference()` n'est lu qu'ICI, après l'attente de la lecture : le routeur
   * lie ses entrées juste après la création du composant, donc un lecteur placé
   * dans le constructeur trouverait l'entrée vide.
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
    // Une feuille scannée peut désigner une commande DÉJÀ déclarée prête — on
    // rescanne justement pour vérifier. L'ouvrir sans basculer de pile aurait
    // rendu un écran qui montre une commande absente de sa propre liste.
    if (found?.packedAt != null) {
      this.stack.set('ready');
    }
  }

  /**
   * **La journée que le fournil colise** : demain si son plan est arrêté,
   * aujourd'hui sinon.
   *
   * ⚠️ **Le seul endroit où l'horloge du poste décide encore quelque chose** :
   * QUELLE date demander. Le contrat n'offre qu'une lecture par date
   * (`GET …/packing?date=`), sans « la journée qu'on colise » ; le passer au
   * serveur demande une route de plus. Le MOT affiché, lui, vient du serveur
   * (`relativeDay`).
   */
  private async workedDay(): Promise<ProductionPackingView> {
    const tomorrow = await this.api.packing(isoDay(nextDay(new Date())));
    return tomorrow.closedAt === null ? this.api.packing(isoDay(new Date())) : tomorrow;
  }

  /**
   * **La relecture silencieuse** — toutes les 15 s tant que l'onglet est visible.
   *
   * Pas d'écran de chargement, et rien de ce que la personne a choisi ne bouge :
   * la pile, la recherche, la commande ouverte. Seul change ce que le serveur
   * sait de nouveau — une ligne cochée ailleurs, une commande déclarée prête sur
   * un autre poste, un article enfin sorti du four.
   *
   * Sautée pendant une déclaration : celle-ci relit elle-même au retour, et deux
   * lectures croisées rendraient l'enchaînement sur la commande suivante
   * incertain.
   *
   * 🔴 Une réponse est **jetée** si une écriture a été acceptée après le départ
   * de la relecture : elle rendrait l'état d'avant.
   */
  private async refresh(): Promise<void> {
    if (this.state() !== 'ready' || this.closing()) {
      return;
    }
    this.readSeq += 1;
    const seq = this.readSeq;
    const startedAt = Date.now();
    const openBefore = this.current();
    try {
      const served = await this.workedDay();
      if (seq !== this.readSeq || this.lastWriteAt >= startedAt) {
        return;
      }
      this.applyRead(served);
      this.noticeClosedElsewhere(openBefore);
    } catch {
      if (seq === this.readSeq) {
        this.refreshFailed.set(true);
      }
    }
  }

  /**
   * **La relecture qui suit une écriture acceptée** — coche, containers ou
   * déclaration.
   *
   * 🔴 **Elle n'est PAS soumise à la règle `lastWriteAt`**, et c'est tout ce qui
   * la sépare de {@link refresh}. Elle part après l'écriture ; or `lastWriteAt`
   * et l'instant de son départ tombent dans la même milliseconde, et la règle
   * `lastWriteAt >= startedAt` l'aurait jetée — c'est-à-dire aurait jeté
   * justement la lecture qui porte le geste qu'on vient de faire. Elle passe
   * devant toute relecture périodique en vol par le rang (`readSeq`).
   *
   * Rend `true` si elle a été inscrite. `false` si elle a échoué (le pied le dit)
   * ou si une lecture plus récente l'a devancée — l'état montré de la case reste
   * alors jusqu'à la prochaine lecture inscrite.
   */
  private async rereadAfterWrite(): Promise<boolean> {
    this.readSeq += 1;
    const seq = this.readSeq;
    try {
      const served = await this.workedDay();
      if (seq !== this.readSeq) {
        return false;
      }
      this.applyRead(served);
      return true;
    } catch {
      if (seq === this.readSeq) {
        this.refreshFailed.set(true);
      }
      return false;
    }
  }

  /**
   * La commande qu'on avait sous les yeux est-elle passée prête ailleurs ?
   *
   * Seulement depuis la pile « en cours » : dans la pile des prêtes, une
   * commande prête est à sa place, et il n'y a rien à dire.
   */
  private noticeClosedElsewhere(openBefore: PackingSheet | null): void {
    if (openBefore === null || openBefore.packedAt !== null || this.stack() !== 'todo') {
      return;
    }
    const now = this.sheets().find((sheet) => sheet.reference === openBefore.reference);
    if (now?.packedAt != null) {
      this.closedElsewhere.set(openBefore.customerLabel);
      this.chosen.set(null);
    }
  }

  /** La personne a vu qu'une commande a été déclarée prête ailleurs. */
  protected acknowledgeClosedElsewhere(): void {
    this.closedElsewhere.set(null);
  }

  /** Ouvre une commande. Un échec ne se traîne pas d'une commande à l'autre. */
  protected choose(reference: string): void {
    this.chosen.set(reference);
    this.unknownReference.set(null);
    this.closeFailed.set(false);
    this.containersFailed.set(false);
    this.justDeclared.set(null);
    this.closedElsewhere.set(null);
  }

  /**
   * Ajoute ou retire **un** container à la commande ouverte, puis relit.
   *
   * 🔴 **Un sens, pas un total** : c'est le serveur qui compte. Aucun compte
   * local, aucun plafond, aucune comparaison à zéro — le serveur rend `remove` à
   * zéro sans effet, et c'est à lui de savoir ce que vaut un retrait. Refusé,
   * le geste se dit ; le compte affiché n'a pas bougé, puisque l'écran n'en
   * tient aucun.
   */
  protected async stepContainers(step: PackingContainerStep): Promise<void> {
    const sheet = this.current();
    if (sheet === null || !this.canSetContainers() || this.containersBusy()) {
      return;
    }
    this.containersFailed.set(false);
    this.containersBusy.set(true);
    try {
      await this.api.stepContainers(this.date(), sheet.reference, step);
    } catch {
      this.containersFailed.set(true);
      this.containersBusy.set(false);
      return;
    }
    this.lastWriteAt = Date.now();
    await this.rereadAfterWrite();
    this.containersBusy.set(false);
  }

  /**
   * Met une ligne dans le bac, ou l'en sort — puis **relit**.
   *
   * La case se coche avant la réponse et se désarme le temps de l'envoi : un
   * second geste contraire pourrait arriver avant le premier. Acceptée, la coche
   * déclenche une relecture, et c'est ce que le serveur relit qui s'affiche —
   * lignes dans le bac, volume, balance. Refusée, la case revient en arrière et
   * l'écran dit pourquoi. Aucun chiffre n'est réécrit ici.
   */
  protected async toggle(sheet: PackingSheet, line: PackingLine, packed: boolean): Promise<void> {
    // 🔴 Deux refus, deux raisons. Une commande déclarée prête ne revient pas
    // dessus ; une ligne dont l'article n'est pas sorti du four redeviendra
    // cochable. Le gabarit désarme déjà les deux cases — ce garde-ci tient le
    // clavier, le test et le jour où un `click()` arrive d'ailleurs.
    if (sheet.packedAt !== null || line.awaitingProduction) {
      return;
    }
    const date = this.date();
    const key = packingMarkKey(date, sheet.reference, line.sku);
    if (this.busy().has(key)) {
      return;
    }
    const initials = this.initials();
    this.markFailed.set(null);
    this.setShown(key, packed);
    this.setBusy(key, true);
    try {
      await this.api.mark(date, sheet.reference, line.sku, packed, initials);
    } catch (error) {
      this.setBusy(key, false);
      this.setShown(key, null);
      this.markFailed.set(
        `${line.productName} · ${sheet.customerLabel} — ${serverMessageOf(error)}`,
      );
      return;
    }
    this.lastWriteAt = Date.now();
    const read = await this.rereadAfterWrite();
    this.setBusy(key, false);
    // Relue : l'état montré cède la place à ce que le serveur a relu. Pas relue
    // (échec, ou devancée) : il reste — le geste a été ACCEPTÉ, et c'est vrai —
    // jusqu'à la prochaine lecture inscrite, qui l'effacera.
    if (read) {
      this.setShown(key, null);
    }
  }

  /**
   * L'état montré des cases de la commande OUVERTE, par SKU — ce que la colonne
   * du milieu recouvre le temps d'un envoi. Une projection des clés de
   * `shown`, pas un chiffre.
   */
  protected readonly openShown = computed<ReadonlyMap<string, boolean>>(() => {
    const sheet = this.current();
    const out = new Map<string, boolean>();
    if (sheet === null) {
      return out;
    }
    for (const line of sheet.lines) {
      const shown = this.shown().get(packingMarkKey(this.date(), sheet.reference, line.sku));
      if (shown !== undefined) {
        out.set(line.sku, shown);
      }
    }
    return out;
  });

  /** Les SKU de la commande ouverte dont la coche est en vol. */
  protected readonly openBusy = computed<ReadonlySet<string>>(() => {
    const sheet = this.current();
    const busy = this.busy();
    if (sheet === null) {
      return new Set();
    }
    return new Set(
      sheet.lines
        .filter((line) => busy.has(packingMarkKey(this.date(), sheet.reference, line.sku)))
        .map((line) => line.sku),
    );
  });

  /** Une coche demandée par la colonne du milieu, sur la commande ouverte. */
  protected onLineToggled(event: PackingLineToggle): void {
    const sheet = this.current();
    if (sheet !== null) {
      void this.toggle(sheet, event.line, event.packed);
    }
  }

  /** « Déclarer prête » demandé par la colonne du milieu, sur la commande ouverte. */
  protected declareCurrent(): void {
    const sheet = this.current();
    if (sheet !== null) {
      void this.close(sheet);
    }
  }

  private setShown(key: string, packed: boolean | null): void {
    const next = new Map(this.shown());
    if (packed === null) {
      next.delete(key);
    } else {
      next.set(key, packed);
    }
    this.shown.set(next);
  }

  private setBusy(key: string, busy: boolean): void {
    const next = new Set(this.busy());
    if (busy) {
      next.add(key);
    } else {
      next.delete(key);
    }
    this.busy.set(next);
  }

  /**
   * **Déclare la commande prête**, puis relit. Le seul geste irréversible du
   * poste, et le seul qui n'attende pas le réseau en silence : un échec reste à
   * l'écran.
   */
  protected async close(sheet: PackingSheet): Promise<void> {
    if (!this.canClose()) {
      return;
    }
    this.closing.set(true);
    this.closeFailed.set(false);
    this.justDeclared.set(null);
    try {
      await this.api.packOrder(this.date(), sheet.reference);
    } catch {
      this.closeFailed.set(true);
      this.closing.set(false);
      return;
    }
    this.lastWriteAt = Date.now();
    // On relit plutôt que d'inscrire l'heure de l'accusé : la déclaration déplace
    // aussi la marchandise, les compteurs des piles et l'avancement de la
    // journée — tous calculés au serveur.
    await this.rereadAfterWrite();
    this.closing.set(false);
    // 🔴 **ON ENCHAÎNE.** La commande vient de quitter la pile « en cours » sous
    // les doigts : oublier le choix fait retomber `current()` sur la tête de la
    // pile, c'est-à-dire sur la commande suivante. Sans ça, l'écran resterait
    // sur une référence absente de sa propre liste, donc sur du vide — au moment
    // le plus fréquent de la journée.
    this.chosen.set(null);
    this.justDeclared.set(sheet.customerLabel);
  }

  protected method(sheet: PackingSheet): string {
    return methodLabel(sheet.fulfillmentMethod);
  }

  /**
   * Les initiales de qui coche, prises sur la personne connectée — même source
   * et même arbitrage que la fiche d'atelier : les demander à l'écran ferait
   * taper deux lettres les doigts farinés à chaque ligne.
   */
  private initials(): string {
    const me = this.permissions.identity();
    if (me === null) {
      return '';
    }
    return `${me.firstName.charAt(0)}${me.lastName.charAt(0)}`.toUpperCase();
  }
}
