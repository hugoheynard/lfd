import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import {
  AtelierSheetNotFoundError,
  InvalidContainerCountError,
  LineNotProducedYetError,
  PackedOrderSealedError,
  PackingLineNotFoundError,
  ProducedItemNotFoundError,
  OrderAlreadyPackedError,
  ProductionDayAlreadyClosedError,
  ProductionDayEmptyError,
  ProductionDayNotClosedError,
} from "../errors/production-errors.js";
import { ServiceDay } from "../value-objects/service-day.value-object.js";

/** Une ligne de commande, figée du côté de la production. */
export interface ProductionLineSnapshot {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  /** `null` = la ligne n'est pas encore dans le bac. C'est le fait du FOURNIL. */
  readonly packed: PackedLineMark | null;
}

/**
 * **La ligne est dans le bac**, telle que le poste de colisage la constate.
 *
 * ## Pourquoi un type à part, et pas un {@link PackedMark} élargi
 *
 * `PackedMark` porte la FERMETURE du bac, et rien ne signe une fermeture : elle
 * arrive par un scan, sans crayon. Lui ajouter `initials` lui donnerait un champ
 * qu'aucune colonne ne stocke et que personne n'écrit — exactement l'état que le
 * commentaire de `PackedMark` raconte avoir coûté cher, à l'envers.
 *
 * Sa forme est celle de {@link DoneMark}, et c'est une coïncidence de forme, pas
 * de sens : l'un dit « c'est sorti du four », l'autre « c'est dans le bac de ce
 * client-là ». Les fusionner ferait qu'un renommage de l'un renommerait l'autre.
 */
export interface PackedLineMark {
  readonly at: Date;
  readonly by: string;
  /** Vide autorisé sur une ligne pourtant au bac — on coche d'abord, on signe si on veut. */
  readonly initials: string;
}

/**
 * **Le colisage constaté** : l'instant ET son auteur, ensemble.
 *
 * 🔴 C'étaient deux champs nullables jusqu'au 2026-09-08, et ils pouvaient donc
 * se contredire — un instant sans auteur, un auteur sans instant. Aucun des deux
 * n'a de sens, et le jour où il a fallu **republier** le fait, il fallait un
 * `?? ""` sur l'auteur : une identité vide dans un événement, pour un état que
 * le modèle laissait exister sans jamais le produire. On corrige le modèle.
 */
export interface PackedMark {
  readonly at: Date;
  readonly by: string;
}

/** Une commande, figée du côté de la production. */
export interface ProductionOrderSnapshot {
  /** `null` = le bac n'est pas fait. C'est le fait du FOURNIL, pas du commerce. */
  readonly packed: PackedMark | null;
  /**
   * **Combien de containers cette commande occupe** — les bacs du véhicule.
   * `0` = personne ne les a encore comptés.
   *
   * 🔴 Rien à voir avec le `ContainerRule` de la fiche d'atelier, qui est le
   * matériel du FOUR réglé par SKU. Celui-ci se compte par COMMANDE, au
   * colisage. Les deux mots se ressemblent et ne désignent pas le même objet.
   */
  readonly containers: number;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly destination: string;
  readonly lines: readonly ProductionLineSnapshot[];
}

/**
 * **La ligne est sortie du four**, telle que le fournil la constate.
 *
 * Un seul objet et pas trois champs nullables, pour la raison exacte que
 * {@link PackedMark} a déjà coûtée : un instant sans auteur, ou un auteur sans
 * instant, sont deux états que rien ne produit et que le modèle laissait
 * pourtant exister.
 *
 * `initials` peut être vide sur une ligne pourtant faite — on coche d'abord, on
 * signe si on veut. C'est un quatrième état volontaire, et le seul.
 */
export interface DoneMark {
  readonly at: Date;
  readonly by: string;
  readonly initials: string;
}

/** Ce qu'il faut fabriquer d'un article, tous clients confondus. */
export interface ProducedItemSnapshot {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  /** `null` = la ligne n'est pas faite. C'est le fait du FOURNIL. */
  readonly done: DoneMark | null;
}

/** L'état d'une journée, tel que l'adaptateur l'écrit et le relit. */
export interface ProductionDaySnapshot {
  readonly serviceDay: string;
  readonly closedAt: Date | null;
  /** Le dernier retirage — `null` tant que la journée porte son tirage d'origine. */
  readonly retaken: PackedMark | null;
  readonly orders: readonly ProductionOrderSnapshot[];
  readonly counts: readonly ProducedItemSnapshot[];
}

/**
 * **Une journée de fabrication** — l'agrégat de la production.
 *
 * ## Pourquoi un agrégat, et pas un CRUD
 *
 * La question de tri du `CLAUDE.md` est « existe-t-il une règle qui peut REFUSER
 * cette écriture ? ». Ici il y en a deux, et elles coûtent cher si on les rate :
 *
 * 1. **Une journée arrêtée ne se recalcule pas.** Le compte à produire est un
 *    instantané pris à la clôture ; les commandes bougent après. Le refaire
 *    donnerait un autre nombre que celui sur lequel le fournil a lancé ses
 *    fournées — et c'est le seul document de tout ce dossier qui ne se
 *    refabrique pas.
 * 2. **Une journée sans commande ne s'arrête pas.** Fermer le vide écrirait un
 *    fait — « ce jour-là on a produit ceci » — là où il n'y a rien eu, et le
 *    compte à produire du lendemain hériterait d'un zéro qu'on croirait mesuré.
 *
 * ## Ce que l'agrégat CONTIENT
 *
 * Les commandes et leurs lignes sont **dedans**, pas à côté : elles n'ont aucun
 * cycle de vie propre, elles naissent et meurent avec la journée. Il n'y a donc
 * ni `ProductionOrderRepository` ni règle qui leur soit propre — les sortir
 * ferait trois agrégats là où l'invariant est un.
 *
 * ## Ce qu'il ne contient PAS
 *
 * **Aucun montant.** Le fournil fabrique, il ne facture pas. L'absence est
 * portée par les types de bout en bout : `ProducibleLine` n'a pas de champ de
 * prix, donc il n'y a rien à laisser vide et rien à remplir par distraction.
 */
export class ProductionDay {
  private constructor(
    readonly day: ServiceDay,
    private closedAtValue: Date | null,
    private retakenValue: PackedMark | null,
    private ordersValue: readonly ProductionOrderSnapshot[],
    private countsValue: readonly ProducedItemSnapshot[],
  ) {}

  /**
   * Une journée qu'on n'a jamais arrêtée. C'est l'état de départ, et le seul
   * qu'on puisse fabriquer sans lire la base.
   */
  static open(day: ServiceDay): ProductionDay {
    return new ProductionDay(day, null, null, [], []);
  }

  /** Rehydrate depuis l'adaptateur. Les value objects revalident au passage. */
  static fromSnapshot(snapshot: ProductionDaySnapshot): ProductionDay {
    return new ProductionDay(
      ServiceDay.of(snapshot.serviceDay),
      snapshot.closedAt,
      snapshot.retaken,
      snapshot.orders,
      snapshot.counts,
    );
  }

  get isClosed(): boolean {
    return this.closedAtValue !== null;
  }

  get closedAt(): Date | null {
    return this.closedAtValue;
  }

  /** Le dernier retirage, ou `null` — la fiche dit quel tirage elle montre. */
  get retaken(): PackedMark | null {
    return this.retakenValue;
  }

  get orders(): readonly ProductionOrderSnapshot[] {
    return this.ordersValue;
  }

  /** Le **compte à produire** : un article, une quantité, tous clients confondus. */
  get counts(): readonly ProducedItemSnapshot[] {
    return this.countsValue;
  }

  /**
   * **Arrête la journée** : fige les commandes et calcule le compte à produire.
   *
   * L'instant vient du port d'horloge, jamais du mur — deux clôtures de la même
   * journée doivent porter le même instant que ce que le journal en dira.
   *
   * @throws {ProductionDayAlreadyClosedError} elle l'est déjà — cf. l'en-tête.
   * @throws {ProductionDayEmptyError} rien à produire ce jour-là.
   */
  /**
   * **Le bac est fait** — le colisage d'une commande de cette journée.
   *
   * ## Pourquoi c'est un fait de la PRODUCTION
   *
   * C'est le fournil qui ferme le bac : personne d'autre ne peut le constater.
   * Le commerce en tire le sien — `ready`, « prête pour le client » — par un
   * événement. Deux faits distincts, chacun chez celui qui l'observe ; les
   * confondre reviendrait à faire écrire au fournil dans les tables du commerce.
   *
   * ## Les trois refus, et ce que chacun évite
   *
   * - **journée non arrêtée** : une commande qu'aucune clôture n'a inscrite
   *   n'est pas à fabriquer aujourd'hui ;
   * - **référence inconnue** : elle n'est pas dans cette journée-là ;
   * - **déjà colisée** : deux mains sur la même feuille est le cas NORMAL au
   *   fournil, et le premier scan est le seul vrai. Le second ne doit pas
   *   réécrire l'heure ni changer l'identité qui l'a déclaré.
   *
   * ⚠️ Aucun refus sur une commande ANNULÉE, et c'est un fait, pas un oubli :
   * rien n'annule une commande dans ce système — `cancelled` est une valeur que
   * l'énuméré accepte et que personne n'écrit. Le jour où l'annulation existera,
   * elle devra se propager jusqu'ici, sinon le fournil colisera pour rien.
   *
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
   * @throws {OrderAlreadyPackedError} le bac est déjà fait.
   */
  pack(reference: string, at: Date, by: string): ProductionOrderSnapshot {
    const target = this.sheetToPack(reference);
    if (target.packed !== null) {
      throw new OrderAlreadyPackedError(reference);
    }
    const packed: ProductionOrderSnapshot = { ...target, packed: { at, by } };
    this.ordersValue = this.ordersValue.map((order) =>
      order.reference === reference ? packed : order,
    );
    return packed;
  }

  /**
   * La fiche qu'on s'apprête à coliser — **sans rien muter**.
   *
   * Elle porte les deux refus STRUCTURELS, ceux qui disent que le geste n'a pas
   * de sens ici : la journée n'est pas arrêtée, ou cette référence n'est pas au
   * plan. Elle ne dit rien du bac lui-même — c'est l'appelant qui lit `packed`,
   * parce que « déjà fait » n'est pas une erreur pour tout le monde : le
   * handler y voit une REANNONCE à faire, `pack` y voit un refus.
   *
   * Les deux refus vivent ici, en un seul endroit, plutôt que recopiés chez
   * l'appelant — c'est la raison d'être de cette méthode.
   *
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
   */
  sheetToPack(reference: string): ProductionOrderSnapshot {
    if (!this.isClosed) {
      throw new ProductionDayNotClosedError(this.day.value);
    }
    const target = this.ordersValue.find((order) => order.reference === reference);
    if (target === undefined) {
      throw new AtelierSheetNotFoundError(reference, this.day.value);
    }
    return target;
  }

  /**
   * La ligne qu'on s'apprête à mettre au bac — ou à en ressortir. **Sans muter.**
   *
   * ## Ce qu'elle refuse, et pourquoi c'est ici
   *
   * Les trois refus STRUCTURELS d'abord, ceux qui disent que le geste n'a pas de
   * sens : la journée n'est pas arrêtée, cette référence n'est pas au plan, ce
   * SKU n'est pas sur ce bon-là. Même figure que {@link sheetToPack}, et même
   * raison : les recopier chez les deux appelants (cocher, décocher) les rendrait
   * invisibles au troisième.
   *
   * Le **bac fermé** ensuite, et c'est la différence avec {@link sheetToPack}.
   * Là-bas, « déjà colisé » n'est pas un refus pour tout le monde — le handler y
   * voit une réannonce à faire — donc la garde reste chez l'appelant. Ici,
   * fermé est un refus pour TOUS les appelants : le contenu du bac a été annoncé
   * au commerce, qui en a tiré « prête pour le client ». Une garde qui vaut pour
   * tous les appelants appartient à l'agrégat.
   *
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
   * @throws {PackedOrderSealedError} le bac est fermé, son contenu ne bouge plus.
   * @throws {PackingLineNotFoundError} ce SKU n'est pas sur ce bon.
   */
  lineToPack(reference: string, sku: string): ProductionLineSnapshot {
    const sheet = this.sheetToPack(reference);
    if (sheet.packed !== null) {
      throw new PackedOrderSealedError(reference);
    }
    const line = sheet.lines.find((candidate) => candidate.sku === sku);
    if (line === undefined) {
      throw new PackingLineNotFoundError(sku, reference);
    }
    return line;
  }

  /**
   * La ligne qu'on s'apprête à **mettre** au bac — `lineToPack`, plus une règle.
   *
   * ## Pourquoi une méthode de plus, et pas une garde dans `lineToPack`
   *
   * Le refus « pas encore sorti du four » ne vaut que dans UN sens. Cocher une
   * ligne dont l'article n'est pas fabriqué ferait compter comme réparti ce qui
   * n'existe pas, et le reste à répartir deviendrait optimiste — le seul sens
   * où se tromper coûte. Mais **ressortir** du bac une ligne devenue « en
   * attente », parce qu'un fournil a repris sa coche sur la fiche d'atelier,
   * doit rester possible : refuser les deux sens enfermerait l'exploitant avec
   * un bac qu'il ne peut ni compléter ni corriger.
   *
   * Deux appelants, deux jeux de refus : la garde asymétrique vit donc dans une
   * méthode à elle, et `lineToPack` garde ce qui vaut pour les deux.
   *
   * ## Ce que « pas encore sorti du four » veut dire, exactement
   *
   * La ligne du compte à produire n'est pas cochée (`done === null`), **ou** le
   * SKU n'est pas au compte du tout. Le second cas est celui d'un article arrivé
   * après le tirage : personne ne l'a fabriqué, et personne ne peut même le
   * cocher sur la fiche tant que le plan n'a pas été repris.
   *
   * 🔴 La règle est ici et pas seulement à l'écran. Un bouton grisé n'est pas
   * une règle : la route reste ouverte, et un second poste — ou un rejeu de la
   * file hors ligne du fournil — passerait à travers.
   *
   * @throws {LineNotProducedYetError} l'article n'est pas sorti du four.
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
   * @throws {PackedOrderSealedError} le bac est fermé, son contenu ne bouge plus.
   * @throws {PackingLineNotFoundError} ce SKU n'est pas sur ce bon.
   */
  lineToFill(reference: string, sku: string): ProductionLineSnapshot {
    const line = this.lineToPack(reference, sku);
    if (this.isAwaitingProduction(sku)) {
      throw new LineNotProducedYetError(line.productName);
    }
    return line;
  }

  /**
   * L'article attend-il encore le four ?
   *
   * Les deux cas mènent au même refus : pas coché sur la fiche, ou pas au compte
   * du tout. Un SKU absent du compte n'est pas une donnée manquante — c'est un
   * article arrivé après le tirage, que personne n'a fabriqué **ni même pu
   * cocher**. Le traiter comme disponible serait exactement l'erreur qu'on
   * cherche à empêcher.
   */
  isAwaitingProduction(sku: string): boolean {
    return this.countsValue.find((item) => item.sku === sku)?.done == null;
  }

  /**
   * **Annoncer combien de containers la commande occupe** — les bacs du véhicule.
   *
   * ## Les refus, et ce que chacun évite
   *
   * Les deux refus structurels viennent de {@link sheetToPack} : sans journée
   * arrêtée il n'y a pas de bon, et une référence hors du plan n'est pas de ce
   * jour-là. S'y ajoutent :
   *
   * - **le bac fermé** — exactement au même titre que ses lignes ne se
   *   décochent plus. Le nombre de bacs a été annoncé avec le reste ; le
   *   corriger après coup ferait mentir ce que le commerce a déjà dit au
   *   client, et le chargeur du véhicule compte sur un papier qui ne bouge pas ;
   * - **un nombre qui n'en est pas un** — ni négatif, ni fractionnaire. On ne
   *   charge pas deux bacs et demi.
   *
   * Le PLAFOND, lui, reste à la frontière (`setPackingContainersSchema`) : c'est
   * une garde de saisie, pas une règle du fournil.
   *
   * @returns la commande telle qu'elle est désormais.
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
   * @throws {PackedOrderSealedError} le bac est fermé, son annonce ne bouge plus.
   * @throws {InvalidContainerCountError} ce n'est pas un nombre de bacs.
   */
  declareContainers(reference: string, containers: number): ProductionOrderSnapshot {
    const sheet = this.sheetToPack(reference);
    if (sheet.packed !== null) {
      throw new PackedOrderSealedError(reference);
    }
    if (!Number.isInteger(containers) || containers < 0) {
      throw new InvalidContainerCountError(containers);
    }
    const counted: ProductionOrderSnapshot = { ...sheet, containers };
    this.ordersValue = this.ordersValue.map((order) =>
      order.reference === reference ? counted : order,
    );
    return counted;
  }

  close(orders: readonly ProducibleOrder[], at: Date): void {
    if (this.isClosed) {
      throw new ProductionDayAlreadyClosedError(this.day.value);
    }
    if (orders.length === 0) {
      throw new ProductionDayEmptyError(this.day.value);
    }
    this.ordersValue = orders.map(frozen);
    this.countsValue = countOf(orders);
    this.closedAtValue = at;
  }

  /**
   * La ligne qu'on s'apprête à cocher — **sans rien muter**.
   *
   * Même figure que {@link sheetToPack}, et pour la même raison : elle porte les
   * deux refus STRUCTURELS — la journée n'est pas arrêtée, ou ce SKU n'est pas
   * au compte du jour — en un seul endroit plutôt que recopiés chez les deux
   * appelants (cocher, décocher).
   *
   * Elle ne dit rien de l'état de la case. « Déjà cochée » n'est pas un refus
   * ici, contrairement au colisage : voir la note de l'adaptateur.
   *
   * @throws {ProductionDayNotClosedError} rien n'est arrêté, donc rien à cocher.
   * @throws {ProducedItemNotFoundError} ce SKU n'est pas au compte du jour.
   */
  itemToMark(sku: string): ProducedItemSnapshot {
    if (!this.isClosed) {
      throw new ProductionDayNotClosedError(this.day.value);
    }
    const target = this.countsValue.find((item) => item.sku === sku);
    if (target === undefined) {
      throw new ProducedItemNotFoundError(sku, this.day.value);
    }
    return target;
  }

  /**
   * **Le retirage** : absorber ce qui est arrivé depuis que le plan est arrêté.
   *
   * ## Pourquoi ça ne contredit pas l'invariant de l'en-tête
   *
   * « Une journée arrêtée ne se recalcule pas » vise le recalcul **silencieux**
   * — celui qui donnerait un autre nombre que celui sur lequel le fournil a
   * lancé ses fournées, sans que personne l'ait voulu. Le retirage est l'autre
   * chose : un geste **attesté**, fait par quelqu'un à qui l'écran vient de
   * montrer les lignes qui changent et de dire laquelle est déjà cochée. D'où
   * `retakenBy` : sans auteur, ce serait exactement le recalcul qu'on refuse.
   *
   * L'invariant n'est donc pas levé, il est nommé — impossible par accident,
   * possible par décision, et traçable.
   *
   * ## Ce qu'il absorbe, et ce qu'il ne touche pas
   *
   * Seules les commandes que la journée ne porte pas encore, **par `orderId`**.
   * C'est ce filtre qui rend le geste idempotent, et qui le protège du cas
   * tordu : la clôture publie un événement en processus, ni persisté ni rejoué,
   * donc un abonné en échec laisse des commandes `placed` DÉJÀ inscrites au
   * plan. Sans le filtre, un retirage les compterait une seconde fois.
   *
   * Les coches survivent, par SKU — cf. `countOf`.
   *
   * @returns le nombre de commandes réellement absorbées. Zéro = rien n'était
   *   arrivé, et c'est une information, pas une erreur.
   * @throws {ProductionDayNotClosedError} il n'y a pas de tirage à reprendre.
   */
  retake(orders: readonly ProducibleOrder[], at: Date, by: string): number {
    if (!this.isClosed) {
      throw new ProductionDayNotClosedError(this.day.value);
    }
    const known = new Set(this.ordersValue.map((order) => order.orderId));
    const arrivals = orders.filter((order) => !known.has(order.orderId));
    if (arrivals.length === 0) {
      return 0;
    }
    const done = new Map(
      this.countsValue
        .filter((item): item is ProducedItemSnapshot & { done: DoneMark } => item.done !== null)
        .map((item) => [item.sku, item.done] as const),
    );
    // Le compte se refait depuis TOUTES les commandes de la journée, pas en
    // ajoutant les nouvelles au total précédent : c'est la même fonction qui
    // produit les deux, donc un tirage et un retirage ne peuvent pas compter
    // différemment.
    const merged = [...this.ordersValue, ...arrivals.map(frozen)];
    this.ordersValue = merged;
    this.countsValue = countOf(
      merged.map((order) => ({
        orderId: order.orderId,
        reference: order.reference,
        customerLabel: order.customerLabel,
        fulfillmentMethod: order.fulfillmentMethod,
        destination: order.destination,
        lines: order.lines,
      })),
      done,
    );
    this.retakenValue = { at, by };
    return arrivals.length;
  }

  /** L'état à écrire. Les getters de l'agrégat, jamais ses champs privés. */
  toSnapshot(): ProductionDaySnapshot {
    return {
      serviceDay: this.day.value,
      closedAt: this.closedAtValue,
      retaken: this.retakenValue,
      orders: this.ordersValue,
      counts: this.countsValue,
    };
  }
}

/** La commande, recopiée telle qu'elle était — jamais une référence vers elle. */
function frozen(order: ProducibleOrder): ProductionOrderSnapshot {
  return {
    // Une journée qu'on vient d'arrêter n'a rien de colisé : le fournil n'a pas
    // encore commencé. L'écrire ici plutôt que de le laisser deviner évite qu'un
    // champ absent passe pour un bac fait.
    packed: null,
    // Personne n'a encore compté les bacs de cette commande. `0` le dit, et
    // c'est la même valeur qu'une commande dont on aurait dit « aucun » — la
    // distinction n'a pas de sens tant qu'on n'a rien chargé.
    containers: 0,
    orderId: order.orderId,
    reference: order.reference,
    customerLabel: order.customerLabel,
    fulfillmentMethod: order.fulfillmentMethod,
    destination: order.destination,
    lines: order.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      // Une commande qu'on vient d'inscrire n'a rien au bac : le colisage n'a
      // pas commencé. Même geste que le `packed: null` de la commande juste
      // au-dessus, et pour la même raison — un champ absent passerait pour une
      // ligne déjà rangée.
      packed: null,
    })),
  };
}

/**
 * Le compte à produire, **trié par SKU**.
 *
 * Trié, et pas dans l'ordre d'arrivée des commandes : deux clôtures des mêmes
 * commandes doivent rendre le même compte, sans quoi le PDF qu'on en tire
 * cesserait d'être déterministe — et c'est la propriété sur laquelle repose son
 * rangement sans verrou.
 *
 * Le nom retenu est celui de la PREMIÈRE ligne rencontrée pour ce SKU. Deux
 * commandes d'une même journée portent le même catalogue ; si elles divergeaient,
 * c'est le SKU qui ferait foi, pas le libellé.
 */
function countOf(
  orders: readonly ProducibleOrder[],
  /**
   * Ce qui était **déjà coché** avant, par SKU.
   *
   * 🔴 Un retirage ne décoche rien : le pain de seigle sorti du four à 5 h l'est
   * toujours quand la quantité passe de 30 à 42. Perdre la coche ferait
   * refabriquer ce qui est fait ; la garder laisse la ligne cochée sur une
   * quantité qui a monté — c'est le cas dangereux, et c'est précisément celui
   * que le bandeau nomme AVANT de proposer le geste.
   */
  done: ReadonlyMap<string, DoneMark> = new Map(),
): readonly ProducedItemSnapshot[] {
  const bySku = new Map<string, ProducedItemSnapshot>();
  for (const order of orders) {
    for (const line of order.lines) {
      const known = bySku.get(line.sku);
      bySku.set(line.sku, {
        sku: line.sku,
        productName: known?.productName ?? line.productName,
        quantity: (known?.quantity ?? 0) + line.quantity,
        done: done.get(line.sku) ?? null,
      });
    }
  }
  return [...bySku.values()].sort((left, right) => left.sku.localeCompare(right.sku));
}
