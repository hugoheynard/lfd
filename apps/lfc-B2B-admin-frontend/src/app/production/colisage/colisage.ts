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
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

// `PackingLine` est ALIASÉ : le composant de ligne porte déjà ce nom, et c'est
// lui qu'on écrit le plus souvent dans ce fichier. Le type garde le suffixe
// `View`, comme dans `app-packing-line`.
import type {
  PackingLine as PackingLineView,
  PackingSheet,
  ProductionPackingView,
} from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { AwaitingBadge } from './awaiting-badge/awaiting-badge';
import { PackingContainers } from './packing-containers/packing-containers';
import { PackingLine } from './packing-line/packing-line';
import {
  isComplete,
  matchesTerm,
  methodLabel,
  normaliseTerm,
  packedCount,
  packingBoard,
  packingMarkKey,
  type LocalPackingMark,
} from '../packing-board';
import { refreshWhileVisible } from '../periodic-refresh';
import { serverMessageOf } from '../server-message';
import { PackingService } from '../packing.service';
import { dayLabelOf, hourLabel, isoDay, nextDay } from '../worksheet-day';

type LoadState = 'loading' | 'ready' | 'error';

/** Les deux piles de la colonne de gauche. */
type PackingStack = 'todo' | 'ready';

/**
 * Le plafond de containers d'une commande, recopié du contrat
 * (`setPackingContainersSchema`, borne haute 99).
 *
 * Ici plutôt qu'en laissant le serveur refuser : le `+` est un geste qu'on fait
 * les mains prises, et un doigt qui reste posé doit buter sur quelque chose
 * plutôt que d'envoyer quarante requêtes qui finiront toutes en 400.
 */
const MAX_CONTAINERS = 99;

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
 * **Deux états, un seul réversible.** Cocher une ligne est un état de travail :
 * il part tout de suite, et revient en arrière en le disant s'il est refusé
 * (plus de file hors ligne depuis le 2026-09-14). Déclarer la commande prête est
 * le fait irréversible : il échoue à l'écran et se redit.
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
    AwaitingBadge,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSearchComponent,
    FoldSurfaceDirective,
    FoldViewToggleComponent,
    PackingContainers,
    PackingLine,
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
   * 🔴 **La journée que le fournil est en train de coliser** — elle se déduit,
   * elle ne se choisit pas.
   *
   * La même règle que la fiche d'atelier, et pour la même raison : demain dès
   * que le plan de demain est arrêté, aujourd'hui sinon. C'est le geste du soir
   * qui fait basculer l'écran, pas une heure devinée sur l'horloge du poste — un
   * sélecteur de plus serait une question de plus à 4 h du matin.
   *
   * En contrepartie, l'en-tête NOMME sa journée en toutes lettres : sans
   * sélecteur, c'est la seule chose qui dise au fournil quel jour il colise.
   */
  protected readonly date = signal(isoDay(new Date()));

  /** « samedi 16 août » — l'en-tête du poste. */
  protected readonly dayLabel = computed(() => dayLabelOf(this.date()));

  /**
   * « aujourd'hui » ou « demain », à côté de la date. Vide en dehors de ces deux
   * cas — le poste ne montre jamais une autre journée, et un troisième mot
   * suggérerait qu'il le pourrait.
   */
  protected readonly dayOffset = computed(() => {
    const day = this.date();
    if (day === isoDay(new Date())) {
      return 'aujourd’hui';
    }
    return day === isoDay(nextDay(new Date())) ? 'demain' : '';
  });

  protected readonly state = signal<LoadState>('loading');

  private readonly view = signal<ProductionPackingView | null>(null);

  /** Les coches en cours d'envoi, par `AAAA-MM-JJ RÉFÉRENCE SKU` — montrées avant la réponse. */
  private readonly localMarks = signal<ReadonlyMap<string, LocalPackingMark>>(new Map());

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
   * fermé ailleurs, par le compte de l'AUTRE pile affiché sous le champ.
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

  /** Une déclaration en vol — le bouton se désarme pour ne pas doubler le geste. */
  protected readonly closing = signal(false);

  /**
   * Le compte de containers posé **ici**, par référence de commande.
   *
   * Le `+` doit répondre sous le doigt : sur un quai, un chiffre qui met deux
   * secondes à bouger se re-tape. Ce qui est posé ici l'emporte sur le serveur
   * jusqu'à la relecture — et **retombe** sur la valeur servie si l'envoi
   * échoue, plutôt que de laisser un compte que personne n'a enregistré.
   */
  private readonly localContainers = signal<ReadonlyMap<string, number>>(new Map());

  /** Le compte de containers vient-il d'être refusé ? Il se dit, il ne se tait pas. */
  protected readonly containersFailed = signal(false);

  /** Les lignes dont la coche est en train de partir — leur case est désarmée. */
  private readonly busy = signal<ReadonlySet<string>>(new Set());

  /**
   * La dernière coche refusée, avec le produit, la commande et la raison du
   * serveur. 🔴 La case est revenue en arrière, et la balance avec : il reste à
   * le DIRE, sinon elle a l'air d'avoir bougé toute seule.
   */
  protected readonly markFailed = signal<string | null>(null);

  /**
   * L'instant de la dernière écriture acceptée — coche ou containers. Une
   * relecture partie AVANT elle rendrait l'état d'avant : sa réponse est jetée.
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
    // de sélecteur de date : le seul à écrire `date` est `load` lui-même, donc
    // un effet qui la lirait se rappellerait après chaque lecture — et le jour
    // où la règle bascule d'aujourd'hui à demain, il partirait deux fois.
    void this.load();
    // Les autres postes colisent aussi : sans relecture, une commande déclarée
    // prête ailleurs resterait « en cours » ici, et la balance mentirait.
    refreshWhileVisible(() => this.refresh());
  }

  /** Les bacs et la ressource, recouverts par ce qui a été coché ici. */
  private readonly board = computed(() => {
    const view = this.view();
    return view === null ? { sheets: [], resources: [] } : packingBoard(view, this.localMarks());
  });

  protected readonly sheets = computed(() => this.board().sheets);

  /**
   * La marchandise à répartir, **pour la journée entière**, prêtes comprises.
   *
   * Elle ne bouge pas avec le sélecteur de pile, et c'est tout le sujet : ce qui
   * est parti dans un bac reste réparti. Une marchandise qui suivrait la pile
   * affichée remonterait un reste qui ne correspond à rien de réel.
   */
  protected readonly resources = computed(() => this.board().resources);

  /** Ce qui reste à faire. */
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

  /** Les deux segments du sélecteur, chacun avec son compte. */
  protected readonly stackTabs = computed<readonly FoldViewToggleOption[]>(() => [
    { value: 'todo', label: `En cours ${this.todoSheets().length}` },
    { value: 'ready', label: `Prêtes ${this.readySheets().length}` },
  ]);

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

  /** Combien de lignes du bac ouvert sont dedans. */
  protected readonly currentPacked = computed(() => {
    const sheet = this.current();
    return sheet === null ? 0 : packedCount(sheet);
  });

  /** Combien de bacs sont fermés — le chiffre d'avancement de la journée. */
  protected readonly closedSheets = computed(
    () => this.sheets().filter((sheet) => sheet.packedAt !== null).length,
  );

  /**
   * 🔴 **Le terme cherché SURLIGNE, il ne filtre pas.**
   *
   * Filtrer casserait la balance : le reste à répartir porte sur la journée
   * entière, et une liste réduite ferait lire un reste qui ne correspond à rien
   * de ce qui est affiché. La question de cet outil est « j'ai douze
   * croissants, qui les attend ? » — il faut donc voir EN MÊME TEMPS ce qui
   * reste et toutes les commandes qui en veulent.
   *
   * Tout est déjà en mémoire, et la journée tient en quelques dizaines de
   * lignes : aucun appel réseau, aucun délai.
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
  private readonly hits = computed<ReadonlySet<string>>(() => {
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

  /** Cet article est-il celui qu'on cherche ? */
  protected hit(sku: string): boolean {
    return this.hits().has(sku);
  }

  /**
   * **Combien cette commande en attend**, en produits.
   *
   * C'est là qu'est la valeur de l'outil : répartir une marchandise courte,
   * c'est choisir entre des commandes, et on ne choisit pas sans savoir combien
   * chacune en demande. `0` = elle ne contient pas l'article.
   */
  protected wanted(sheet: PackingSheet): number {
    const hits = this.hits();
    return sheet.lines
      .filter((line) => hits.has(line.sku))
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  /** Les commandes que le terme touche ICI — le compte affiché à côté du champ. */
  protected readonly hitOrders = computed(
    () => this.visibleSheets().filter((sheet) => this.wanted(sheet) > 0).length,
  );

  /** Le terme ne désigne rien de la journée : on le DIT plutôt que de ne rien changer. */
  protected readonly noHit = computed(() => this.searching() && this.hits().size === 0);

  /** Les commandes touchées dans la pile affichée. */
  private readonly hitsHere = computed(
    () => this.visibleSheets().filter((sheet) => this.wanted(sheet) > 0).length,
  );

  /**
   * 🔴 **Les commandes touchées dans l'AUTRE pile.**
   *
   * Sans ce compte, le sélecteur rendrait faux ce que la recherche promet : un
   * article présent dans trois commandes déjà prêtes n'apparaîtrait nulle part,
   * et on conclurait qu'il n'est demandé par personne. C'est exactement le
   * malentendu que « ça surligne, ça ne filtre pas » existe pour empêcher —
   * sauf qu'ici c'est le sélecteur qui filtre, légitimement, et c'est donc à lui
   * de rendre des comptes.
   */
  protected readonly hitsElsewhere = computed(() => {
    const others = this.stack() === 'todo' ? this.readySheets() : this.todoSheets();
    return others.filter((sheet) => this.wanted(sheet) > 0).length;
  });

  /** Le nom de l'autre pile, pour le dire en toutes lettres. */
  protected readonly otherStackLabel = computed(() =>
    this.stack() === 'todo' ? 'prêtes' : 'en cours',
  );

  /** Le terme ne trouve rien ICI, mais quelque chose ailleurs. */
  protected readonly onlyElsewhere = computed(
    () => this.searching() && this.hitsHere() === 0 && this.hitsElsewhere() > 0,
  );

  /** Change de pile. Le choix courant retombe sur la tête de la nouvelle pile. */
  protected chooseStack(stack: string): void {
    this.stack.set(stack === 'ready' ? 'ready' : 'todo');
    this.chosen.set(null);
    this.justDeclared.set(null);
  }

  /** Vide la recherche — le `×` du champ et la touche Échap font le même geste. */
  protected clearTerm(): void {
    this.term.set('');
  }

  /**
   * 🔴 « Déclarer prête » n'est actif que lorsque TOUTES les lignes sont cochées.
   *
   * L'écran est plus exigeant que la route de scan, qui reste inconditionnelle :
   * elle est encodée dans des papiers en circulation, et y ajouter une condition
   * ferait échouer une feuille posée sur un plan de travail. Ici rien ne presse,
   * et une commande déclarée prête à moitié est un client qui vient pour rien.
   */
  protected readonly canClose = computed(() => {
    const sheet = this.current();
    return sheet !== null && sheet.packedAt === null && isComplete(sheet) && !this.closing();
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
   * **Les containers de la commande ouverte, un par entrée.**
   *
   * 🔴 Une LISTE là où le contrat ne porte qu'un nombre, et c'est délibéré :
   * les produits seront glissés-déposés dans des containers nommés, et ce
   * nombre deviendra la longueur de cette liste-là. Le gabarit boucle donc
   * déjà — le jour venu, on change la source de la boucle et chaque entrée
   * gagne un nom et une zone de dépôt. Peindre un simple chiffre aurait
   * demandé de refaire le bloc entier.
   *
   * ⚠️ Ce n'est PAS un `production_container` (le matériel du four, réglé par
   * SKU). Ici c'est le contenant d'expédition d'UNE commande.
   */
  protected readonly containerSlots = computed<readonly number[]>(() => {
    const sheet = this.current();
    if (sheet === null) {
      return [];
    }
    return Array.from({ length: this.containersOf(sheet) }, (_, index) => index + 1);
  });

  /** Le compte affiché pour la commande ouverte — local s'il y en a un, servi sinon. */
  protected readonly containers = computed(() => {
    const sheet = this.current();
    return sheet === null ? 0 : this.containersOf(sheet);
  });

  /** Une commande déclarée prête ne change plus de compte : rien ne revient dessus. */
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
      this.view.set(served);
      // La journée vient de la RÉPONSE, pas de la demande : `workedDay` peut
      // rendre demain là où on avait aujourd'hui, et l'en-tête doit nommer la
      // journée qu'on lit, jamais celle qu'on a demandée.
      this.date.set(served.date);
      this.openAsked(served);
      this.state.set('ready');
      this.readAt.set(new Date().toISOString());
      this.refreshFailed.set(false);
    } catch {
      if (seq === this.readSeq) {
        this.state.set('error');
      }
    }
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
   * On demande demain D'ABORD, comme la fiche : la journée qui a un plan arrêté
   * est celle qu'on fabrique, et une seule lecture suffit dans le cas courant —
   * celui du fournil de la nuit.
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
      this.view.set(served);
      this.date.set(served.date);
      this.noticeClosedElsewhere(openBefore);
      this.readAt.set(new Date().toISOString());
      this.refreshFailed.set(false);
    } catch {
      if (seq === this.readSeq) {
        this.refreshFailed.set(true);
      }
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
   * Ajoute ou retire **un** container à la commande ouverte.
   *
   * Le geste est gros et sans ambiguïté parce qu'on l'actionne les mains
   * prises ; le compte est écrit à l'écran d'abord, puis envoyé. Un envoi refusé
   * REPOSE la valeur servie et le dit : un compte de containers sert à charger
   * un véhicule, et le montrer enregistré alors qu'il ne l'est pas ferait partir
   * un camion sur une croyance.
   *
   * Le plafond de 99 est celui du contrat (`setPackingContainersSchema`) : une
   * saisie qui part en boucle bute ici plutôt que d'aller se faire refuser.
   */
  protected async stepContainers(step: number): Promise<void> {
    const sheet = this.current();
    if (sheet === null || !this.canSetContainers()) {
      return;
    }
    const wanted = Math.min(MAX_CONTAINERS, Math.max(0, this.containersOf(sheet) + step));
    if (wanted === this.containersOf(sheet)) {
      return;
    }
    this.containersFailed.set(false);
    this.writeContainers(sheet.reference, wanted);
    try {
      await this.api.setContainers(this.date(), sheet.reference, wanted);
      // Accepté : inscrit dans ce qu'on a lu, puis le compte local s'efface —
      // sinon il l'emporterait pour toujours, et ce poste ne verrait jamais un
      // autre poste changer le compte de cette commande.
      this.writeServedSheet(sheet.reference, (served) => ({ ...served, containers: wanted }));
      this.dropContainers(sheet.reference);
      this.lastWriteAt = Date.now();
    } catch {
      this.dropContainers(sheet.reference);
      this.containersFailed.set(true);
    }
  }

  /** Le compte affiché d'une commande : celui posé ici, ou celui du serveur. */
  private containersOf(sheet: PackingSheet): number {
    return this.localContainers().get(sheet.reference) ?? sheet.containers;
  }

  private writeContainers(reference: string, value: number): void {
    const next = new Map(this.localContainers());
    next.set(reference, value);
    this.localContainers.set(next);
  }

  private dropContainers(reference: string): void {
    const next = new Map(this.localContainers());
    next.delete(reference);
    this.localContainers.set(next);
  }

  /**
   * Met une ligne dans le bac, ou l'en sort : **à l'écran tout de suite**, au
   * serveur aussitôt.
   *
   * La case se coche avant la réponse et se désarme le temps de l'envoi : un
   * second geste contraire pourrait arriver avant le premier. Acceptée, la
   * coche est inscrite dans ce qu'on a lu ; refusée, elle revient en arrière — la
   * balance avec — et l'écran dit pourquoi.
   */
  protected async toggle(
    sheet: PackingSheet,
    line: PackingLineView,
    packed: boolean,
  ): Promise<void> {
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
    this.setLocal(key, { packed, initials });
    this.setBusy(key, true);
    try {
      await this.api.mark(date, sheet.reference, line.sku, packed, initials);
      this.writeServedSheet(sheet.reference, (served) => ({
        ...served,
        lines: served.lines.map((candidate) =>
          candidate.sku === line.sku
            ? { ...candidate, packed, initials: packed && initials !== '' ? initials : null }
            : candidate,
        ),
      }));
      this.lastWriteAt = Date.now();
    } catch (error) {
      this.markFailed.set(
        `${line.productName} · ${sheet.customerLabel} — ${serverMessageOf(error)}`,
      );
    } finally {
      this.setLocal(key, null);
      this.setBusy(key, false);
    }
  }

  /** La coche de cette ligne est-elle en train de partir ? */
  protected isBusy(sheet: PackingSheet, line: PackingLineView): boolean {
    return this.busy().has(packingMarkKey(this.date(), sheet.reference, line.sku));
  }

  /** Réécrit une commande dans ce qu'on a lu — après une écriture acceptée. */
  private writeServedSheet(reference: string, change: (sheet: PackingSheet) => PackingSheet): void {
    this.view.update((view) =>
      view === null
        ? view
        : {
            ...view,
            sheets: view.sheets.map((sheet) =>
              sheet.reference === reference ? change(sheet) : sheet,
            ),
          },
    );
  }

  private setLocal(key: string, mark: LocalPackingMark | null): void {
    const next = new Map(this.localMarks());
    if (mark === null) {
      next.delete(key);
    } else {
      next.set(key, mark);
    }
    this.localMarks.set(next);
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
   * **Déclare la commande prête.** Le seul geste irréversible du poste, et le
   * seul qui n'attende pas le réseau en silence : un échec reste à l'écran.
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
      return;
    } finally {
      this.closing.set(false);
    }
    // On relit plutôt que d'inscrire l'heure de l'accusé : la déclaration déplace
    // aussi la marchandise et l'avancement de la journée, et deux sources pour
    // la même commande divergeraient à la première déclarée par un autre poste.
    await this.load();
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
   * Les **produits** d'une commande, en pièces — pas ses lignes.
   *
   * Une commande de trois lignes peut porter quarante croissants, et c'est ce
   * nombre-là qu'on regarde en préparant : il dit ce qu'il y a à mettre dedans,
   * et il se compare directement à la marchandise à répartir, qui est comptée
   * dans la même unité. Un compte de lignes ne se compare à rien.
   */
  protected pieces(sheet: PackingSheet): number {
    return sheet.lines.reduce((sum, line) => sum + line.quantity, 0);
  }

  /** Les pièces DÉJÀ dedans — le numérateur du même compte. */
  protected packedPieces(sheet: PackingSheet): number {
    return sheet.lines.filter((line) => line.packed).reduce((sum, line) => sum + line.quantity, 0);
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
