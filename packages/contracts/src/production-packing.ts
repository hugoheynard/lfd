import { z } from "zod";

import type { OrderSaleUnit } from "./order.js";
import type { PackingContainerView } from "./packing-containers.js";
import type { WithdrawnPackingSheet } from "./production-packing-withdrawn.js";

/**
 * **Le colisage** — répartir ce qui est sorti du four dans les bacs des clients.
 *
 * ## Ce que cet écran est, et ce qu'il n'est pas
 *
 * Ce n'est pas la fiche d'atelier vue sous un autre angle. La fiche répond à
 * « qu'est-ce qu'on sort du four », tous clients confondus, et sa clé est le
 * RAYON. Ici la clé est la **commande** : on prend un bon, on coche ses lignes
 * en les mettant dans le bac, et on ferme. Les deux écrans lisent la même
 * journée et ne posent pas la même question — l'un fabrique, l'autre répartit.
 *
 * Ce n'est pas non plus le retrait. Ce qui se passe ici reste au fournil : le
 * bac est fermé, il n'a changé de mains avec personne. Le geste de remise vit
 * dans `handover/`, et sa clé n'est même pas la journée.
 *
 * ## 🔴 L'écran n'additionne rien (décidé le 2026-09-14)
 *
 * Tout ce qui s'affiche en chiffre sur le poste — volume d'une commande, lignes
 * dans le bac, compteurs des piles, marchandise à répartir — est **calculé au
 * serveur** et porté par ce contrat. L'écran relit après chaque geste et affiche
 * tel quel. Deux calculs du même chiffre, l'un au serveur et l'autre à l'écran,
 * divergent à la première règle qui change d'un seul côté ; et c'est justement
 * la balance, ce que ce poste existe pour montrer juste, qui divergeait.
 *
 * ## Aucun montant, et c'est le TYPE qui le tient
 *
 * Même règle que `ProducibleLine` : le fournil colise, il ne facture pas. Il n'y
 * a pas de champ de prix à laisser vide, donc aucun `...spread` distrait ne peut
 * en faire arriver un sur un écran de préparation.
 */

/** La date lue par l'écran de colisage — le jour de **service**. */
export const productionPackingQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ"),
});
export type ProductionPackingQuery = z.infer<typeof productionPackingQuerySchema>;

/**
 * Une ligne d'un bac : ce qui est dû, et si c'est dedans.
 *
 * `packed` est **réversible**, contrairement à la fermeture du bac. Une ligne
 * cochée par erreur les doigts farinés doit pouvoir se reprendre ; c'est
 * exactement l'arbitrage déjà fait sur la coche de la fiche d'atelier.
 */
export interface PackingLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  /**
   * L'unité de la ligne (`plan-vente-au-poids.md`, P6) : `weight` = la
   * quantité, `allocated` et `unallocated` sont des GRAMMES, et la ligne se met
   * au bac en UN lot — l'écran propose le lot entier, jamais un pas de 1.
   */
  readonly saleUnit: OrderSaleUnit;
  readonly packed: boolean;
  /** Qui a mis la ligne dans le bac. Vide autorisé sur une ligne pourtant cochée. */
  readonly initials: string | null;
  readonly packedAt: string | null;
  /**
   * 🔴 **L'article n'est pas encore sorti du four.**
   *
   * C'est la fiche d'atelier qui le dit : tant que sa ligne n'est pas cochée
   * pour ce SKU, la marchandise n'existe pas, et la mettre dans un bac est
   * impossible au sens propre. La ligne est donc INCOCHABLE, et elle le dit.
   *
   * Sans ce champ, l'écran laissait cocher ce qui n'était pas fabriqué : la
   * balance comptait comme réparti ce qui n'avait jamais été sorti, et le reste
   * affiché devenait faux dans le seul sens qui coûte — optimiste.
   *
   * Un article absent du compte à produire est lui aussi « en attente » : il est
   * arrivé après le tirage, et personne ne l'a encore fabriqué.
   */
  readonly awaitingProduction: boolean;
  /**
   * Les pièces de la ligne réparties dans les contenants (K2b, ajouté le
   * 2026-10-04). Sur une commande `counted`, la quantité si la ligne est
   * cochée, sinon zéro.
   *
   * Facultatif dans le TYPE seulement : le serveur l'envoie toujours.
   */
  readonly allocated?: number;
  /** `quantity - allocated` — la colonne « À répartir ». Calculé au serveur. */
  readonly unallocated?: number;
}

/**
 * La source de `PackingSheet.readyBy` : le départ de la tournée (`round`), le
 * départ du transfert interne (`transfer`), ou l'échéance figée par le
 * fournil (`due`).
 */
export type PackingReadyBySource = "round" | "transfer" | "due";

/**
 * Un bac — une commande de la journée, vue du poste de préparation.
 *
 * `packedAt` est le fait **irréversible** : le bac est fermé, et le commerce
 * l'apprend. Rien ici ne le rouvre, et c'est voulu — un colis annoncé prêt à un
 * client ne se déclare pas non prêt par une case décochée.
 */
/** Où en est l'impression du BL d'une commande, vu du poste (cf. `PackingSheet.deliveryNotePrint`). */
export type PackingDeliveryNotePrint = "to_reprint" | "reprinted";

/** Une ligne du reste abandonné : l'article, son nom à la commande, les pièces qui ne partent pas. */
export interface PackingAbandonedLine {
  readonly sku: string;
  readonly productName: string;
  /** Des pièces, ou des grammes si `saleUnit = "weight"` (P6). */
  readonly quantity: number;
  readonly saleUnit: OrderSaleUnit;
}

/**
 * **La décision d'un départ incomplet**, vue du poste (Hugo, 2026-10-25 :
 * « la décision choisie doit s'afficher au colisage »). `abandoned` seulement :
 * « à relivrer » arrive avec E7.
 */
export interface PackingShortfallDecision {
  readonly remainder: "abandoned";
  /** ISO 8601. */
  readonly decidedAt: string;
  /** La référence brute de l'auteur — un `StaffUser.id`. */
  readonly decidedBy: string;
  /** « Prénom Nom », ou `null` : l'écran affiche alors la référence brute. */
  readonly decidedByName: string | null;
}

export interface PackingSheet {
  /**
   * L'identifiant de la commande (ajouté le 2026-09-29, plan de tournée lot 4) :
   * déclarer les sacs d'une commande (`POST admin/delivery/sacs`) et les lire
   * (`GET admin/delivery/sacs?order=`) le demandent, et le colisage n'avait
   * que la référence.
   */
  readonly orderId: string;
  readonly reference: string;
  /**
   * **Combien de containers cette commande occupe.** Zéro tant que personne ne
   * l'a dit.
   *
   * ⚠️ **Ce n'est PAS un `production_container`.** Celui-là est le matériel du
   * FOUR — combien de baguettes tiennent sur une tourneuse —, réglé par SKU une
   * fois pour toutes. Celui-ci est le contenant d'expédition d'UNE commande :
   * les bacs qu'on charge dans le véhicule. Ni la même clé, ni le même rythme,
   * ni la même personne. Les confondre mettrait un réglage de four sur un bon de
   * livraison.
   *
   * Sur `listed`, la longueur de `containerList` ; sur `counted`, le compte
   * de l'ancien poste, en lecture seule (K3c).
   */
  readonly containers: number;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  /**
   * **Qui commande** — le badge « Pro » / « Public » du poste (2026-10-06).
   * `null` = inconnue : journée arrêtée avant le champ, ou commande d'avant la
   * distinction côté commerce. L'écran n'affiche alors rien.
   */
  readonly clientele: "pro" | "public" | null;
  /**
   * **Le site qui remet ce retrait**, identifiant opaque du commerce, tel que
   * le fournil l'a figé à l'arrêt (plan `commandes/back-office/tri-depart-et-couleurs.md`,
   * L1a). `null` : une livraison, une commande d'avant le site (S2), ou une
   * ligne inscrite avant que le colisage ne le recopie — l'écran la peint
   * alors en teinte neutre, jamais d'une couleur devinée. Toujours servi ;
   * facultatif dans le TYPE, comme `qualityHeld`, pour les fiches construites
   * à la main avant lui (fixtures des fronts) — un absent se lit `null`.
   */
  readonly siteId?: string | null;
  /** `HH:mm` — début du créneau, sinon fin de l'échéance ; `null` : aucune. Même réserve. */
  readonly dueAt?: string | null;
  /**
   * **L'heure à laquelle la commande doit être prête**, `HH:mm` (lot L2,
   * `commandes/back-office/tri-depart-et-couleurs.md` §3, 2026-10-14) : le départ de
   * sa tournée pour une livraison, le départ du transfert pour un retrait
   * porté au site, l'échéance (`dueAt`) pour un retrait sur place. Lu à chaque
   * ouverture du poste — la composition des tournées vient après la clôture.
   * `null` : aucune heure connue (« pas encore de départ »). Les fiches sont
   * SERVIES dans cet ordre, sans heure en dernier. Même réserve que `siteId`.
   */
  readonly readyBy?: string | null;
  /** D'où vient `readyBy` ; `null` quand il n'y en a pas. Même réserve. */
  readonly readyBySource?: PackingReadyBySource | null;
  readonly destination: string;
  readonly lines: readonly PackingLine[];
  /** Le nombre de lignes de la commande — compté au serveur, l'écran ne compte rien. */
  readonly lineCount: number;
  /** Les lignes déjà dans le bac. */
  readonly packedLines: number;
  /** `lineCount - packedLines` : ce qui reste dehors. */
  readonly remainingLines: number;
  /**
   * Le volume de la commande **en pièces** — la somme de ses quantités. C'est ce
   * nombre-là qu'on compare à la marchandise à répartir, comptée dans la même
   * unité ; un compte de lignes ne se compare à rien.
   */
  readonly pieces: number;
  /** Les pièces déjà dans le bac. */
  readonly packedPieces: number;
  /**
   * « Déclarer prête » est-il permis ? Une **règle**, donc au serveur : aujourd'hui
   * « toutes les lignes dans le bac, et pas déjà déclarée », demain peut-être
   * davantage — et l'écran n'aura rien à réapprendre.
   */
  readonly canDeclareReady: boolean;
  /**
   * « Il manque » est-il permis ? (lot E6a, plan E6 (`documentation/commandes/bon-de-livraison.md`)
   * § 3) : un bac ouvert, rangé en contenants, dont une ligne due n'est pas
   * entièrement répartie. Une règle, donc au serveur.
   */
  readonly canReportShortfall: boolean;
  /**
   * L'instant du manque signalé en vigueur (ISO), `null` = aucun. Effacé quand
   * le bac se ferme complet.
   */
  readonly shortfallReportedAt: string | null;
  /**
   * **Le bon de livraison a changé depuis son impression** (plan E6, § 14) :
   * l'écran dit « réimprimez-le ». Calculé par le serveur ; jamais imprimé =
   * `false`.
   */
  readonly deliveryNoteReprintNeeded: boolean;
  /**
   * **Le BL à imprimer de nouveau, ou réimprimé** (Hugo, 2026-10-25) :
   * `to_reprint` — un BL vivant a changé depuis son impression, ou, sur un
   * départ incomplet décidé, n'a jamais été imprimé depuis ; `reprinted` — le
   * départ incomplet est décidé et tous ses BL vivants sont imprimés à leur
   * version courante ; `null` sinon. Calculé par le serveur.
   *
   * Facultatif dans le TYPE seulement : le serveur l'envoie toujours.
   */
  readonly deliveryNotePrint?: PackingDeliveryNotePrint | null;
  /**
   * **Le reste abandonné** d'un départ incomplet décidé (Hugo, 2026-10-25) :
   * par article, le dû d'origine moins ce qui est parti — les lignes sorties
   * de la fiche comprises. Vide sans décision.
   *
   * Facultatif dans le TYPE seulement : le serveur l'envoie toujours.
   */
  readonly abandonedRemainder?: readonly PackingAbandonedLine[];
  /**
   * **La décision prise** sur le manque (Hugo, 2026-10-25), `null` sans
   * décision. Avec elle, « Déclarer prête » vaut pour ce qui part.
   *
   * Facultatif dans le TYPE seulement : le serveur l'envoie toujours.
   */
  readonly shortfallDecision?: PackingShortfallDecision | null;
  /**
   * Les produits froids posés hors d'un bac isotherme, par nom (2026-10-07) —
   * livraison rangée en contenants seulement ; vide sinon. Un AVERTISSEMENT :
   * « Déclarer prête » reste permis.
   */
  readonly coldOutsideIsotherm: readonly string[];
  /** `null` = le bac n'est pas fermé. */
  readonly packedAt: string | null;
  /**
   * L'id de la fiche staff de l'auteur, ou une valeur qui ne désigne personne —
   * un marqueur (`system`, `seed-pim`…) ou un `sub` que la conversion n'a
   * rattaché à aucune fiche. L'écran affiche `packedByName` et ne lit ce champ
   * que quand le nom manque.
   */
  readonly packedBy: string | null;
  /**
   * « Prénom Nom » de l'auteur, résolu au serveur par l'annuaire. `null` =
   * la valeur ne désigne aucune fiche (marqueur, `sub` jamais lié) :
   * l'écran affiche alors `packedBy` tel quel.
   */
  readonly packedByName: string | null;
  /**
   * **Retenue au contrôle** (`parcours-du-coliseur.md`, question 5 ; lot PC2,
   * 2026-10-02) : un verdict courant `blocking` vise la commande, ou un SKU
   * qu'une de ses lignes porte — la même règle (`heldOrderIds`) que le retrait
   * lit au comptoir. Le coliseur le voit pour sortir le bac de la pièce.
   *
   * Facultatif dans le TYPE seulement : le serveur l'envoie toujours ; un
   * double de test antérieur qui l'omet se lit « non retenue ».
   */
  readonly qualityHeld?: boolean;
  /**
   * **Comment la commande tient ses contenants** (K2b, ajouté le 2026-10-04,
   * `colisage/colisage.md` §5.1) :
   *
   * - `counted` — colisée avec l'ancien poste : **en lecture seule** depuis
   *   K3c (`colisage.md` §17.6) — ni remplie, ni fermée, ni
   *   rouverte ; `canDeclareReady` y vaut toujours `false` ;
   * - `listed` — la colonne Contenants : on y crée des bacs et des sacs, on y
   *   glisse les lignes ; `containers` est le nombre de contenants.
   *
   * Facultatif dans le TYPE seulement : le serveur l'envoie toujours.
   */
  readonly containerMode?: "counted" | "listed";
  /** Les contenants vivants, dans l'ordre de création. Vide sur `counted`. */
  readonly containerList?: readonly PackingContainerView[];
}

/**
 * **La ressource d'un article** : ce que le four a sorti, ce que les bacs ont
 * déjà pris.
 *
 * C'est la moitié que la fiche d'atelier ne porte pas, et c'est elle qui fait de
 * cet écran une balance plutôt qu'une liste de cases. Celui qui colise a besoin
 * de savoir s'il reste des croissants avant d'en mettre douze dans un bac — pas
 * après.
 *
 * ⚠️ `remaining` peut être **négatif**, et ce n'est pas une erreur de calcul :
 * les bacs demandent alors plus que le tirage n'a prévu. C'est précisément le
 * cas qu'un fournil doit voir tôt, et le masquer à zéro l'effacerait.
 */
export interface PackingResource {
  readonly sku: string;
  readonly productName: string;
  /** Ce que le compte à produire de la journée porte pour cet article. */
  readonly produced: number;
  /** La somme des lignes DÉJÀ cochées, tous bacs confondus. */
  readonly allocated: number;
  /** `produced - allocated`. Négatif = les bacs veulent plus que le four n'a sorti. */
  readonly remaining: number;
  /**
   * **Plus rien à répartir** : le reste est à zéro, et l'article est sorti du
   * four. L'écran s'en sert pour masquer la rangée — il ne compare pas le reste.
   *
   * 🔴 Ni un reste NÉGATIF (il en manque : c'est ce qu'il faut voir), ni un
   * article EN ATTENTE (un reste à zéro sur ce qui n'est pas fabriqué n'est pas
   * un stock épuisé) ne le sont.
   */
  readonly exhausted: boolean;
  /**
   * L'article attend encore le four — ce qui en est sorti, moins ce qui est
   * déjà au bac, ne couvre pas ce que les bacs ouverts attendent (fournées
   * progressives, 2026-09-28).
   *
   * Il apparaît quand même dans la marchandise à répartir, et c'est voulu : ce
   * qui est dû existe avant d'être fabriqué. Ce qu'il ne doit pas faire, c'est
   * se lire comme disponible — d'où l'avertissement plutôt que l'omission.
   */
  readonly awaitingProduction: boolean;
}

/**
 * Ce que l'écran de colisage lit, d'un coup.
 *
 * Une seule lecture pour les bacs ET la ressource : la balance n'a de sens que
 * si ses deux plateaux viennent du même instant. Deux appels laisseraient une
 * fenêtre où le reste affiché ne correspond à aucun état réel.
 *
 * `closedAt: null` — la journée n'est pas arrêtée, il n'y a rien à coliser, et
 * `sheets` est vide. L'écran le dit plutôt que de montrer une liste vide qui
 * ressemblerait à « tout est fait ».
 */
export interface ProductionPackingView {
  readonly date: string;
  readonly closedAt: string | null;
  readonly sheets: readonly PackingSheet[];
  /**
   * Les feuilles retirées par une annulation après l'arrêt (plan A1, lot
   * A1.3) — hors de `sheets` et des comptes, montrées à part.
   */
  readonly withdrawnSheets: readonly WithdrawnPackingSheet[];
  readonly resources: readonly PackingResource[];
  /** Toutes les commandes de la journée. */
  readonly orderCount: number;
  /** Celles qui restent à préparer — la pile « En cours ». */
  readonly todoCount: number;
  /** Celles déclarées prêtes — la pile « Prêtes ». */
  readonly readyCount: number;
  /**
   * La journée lue, relativement à aujourd'hui **selon l'horloge du serveur**.
   * `null` = ni aujourd'hui ni demain. L'écran ne compare pas de dates : l'horloge
   * d'un poste de fournil n'est pas une autorité.
   */
  readonly relativeDay: "today" | "tomorrow" | null;
}
