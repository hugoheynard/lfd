import { z } from "zod";

import { workshopInitialsSchema } from "./production-worksheet.js";

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
 * Cocher une ligne de bac. Les initiales suivent la même règle que la fiche
 * d'atelier — trois lettres au plus, et le vide est permis : on coche d'abord,
 * on signe si on veut.
 */
export const markPackingLineSchema = z.object({ initials: workshopInitialsSchema });
export type MarkPackingLine = z.infer<typeof markPackingLineSchema>;

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
}

/**
 * Un bac — une commande de la journée, vue du poste de préparation.
 *
 * `packedAt` est le fait **irréversible** : le bac est fermé, et le commerce
 * l'apprend. Rien ici ne le rouvre, et c'est voulu — un colis annoncé prêt à un
 * client ne se déclare pas non prêt par une case décochée.
 */
export interface PackingSheet {
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
   * Un simple compte pour l'instant, et c'est délibéré : ce qu'on sait
   * aujourd'hui, c'est **combien**. Le jour où l'on posera chaque produit dans
   * un container nommé, ce champ deviendra la longueur de cette liste — et ce
   * qui aura été compté d'ici là restera vrai.
   */
  readonly containers: number;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
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
  /** `null` = le bac n'est pas fermé. */
  readonly packedAt: string | null;
  readonly packedBy: string | null;
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
   * L'article attend encore le four — sa ligne de fiche d'atelier n'est pas
   * cochée.
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

/**
 * **Ajouter ou retirer UN container** à une commande — le geste du poste depuis
 * le 2026-09-14.
 *
 * Un sens, pas un total : c'est le serveur qui calcule le nouveau compte. Un
 * total envoyé par l'écran perdait un container dès que deux postes appuyaient
 * sur « + » en même temps — chacun envoyait le même nombre.
 */
export const packingContainerStepSchema = z.enum(["add", "remove"]);
export type PackingContainerStep = z.infer<typeof packingContainerStepSchema>;

/**
 * @deprecated Depuis le 2026-09-14 — le poste envoie un sens
 * ({@link packingContainerStepSchema}), plus un total. La route `PUT` reste
 * servie **un déploiement de plus** parce qu'elle est en production (CLAUDE.md
 * §0 : un contrat servi se déprécie, il ne disparaît pas dans le même passage).
 *
 * Déclarer combien de containers une commande occupe.
 *
 * Le plafond n'est pas décoratif : il n'existe pas de commande à mille bacs, et
 * une saisie qui part en boucle doit buter quelque part plutôt que d'écrire un
 * nombre que personne ne relira.
 */
export const setPackingContainersSchema = z.object({
  containers: z.number().int().min(0).max(99, "cent containers, ce n'est plus une commande"),
});
export type SetPackingContainers = z.infer<typeof setPackingContainersSchema>;
