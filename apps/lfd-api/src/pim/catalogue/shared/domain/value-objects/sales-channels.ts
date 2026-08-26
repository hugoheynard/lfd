import {
  isRootPointOfSale,
  ROOT_POINT_OF_SALE_ID,
} from "../../../../points-of-sale/domain/value-objects/bootstrap-point-of-sale.js";

/**
 * Un canal **vendu** : un contexte, et le point de vente qui le vend.
 *
 * `pointOfSaleId` n'est **pas nullable**, et c'est le gain de tout le chantier.
 * C'était `locationId: string | null`, où `null` voulait dire « le B2B » — un
 * `NULL` porteur de sens, donc une ligne absente quelque part. La plateforme
 * professionnelle a désormais la sienne : tout canal se vend depuis un point de
 * vente, sans exception à retenir.
 */
export interface SoldChannel {
  readonly pointOfSaleId: string;
  readonly context: string;
}

/**
 * Où et comment une gamme se vend — un **ensemble de paires**.
 *
 * ## Ce que cette forme a remplacé
 *
 * C'était deux cartes imbriquées : `{ boutiques: Record<locationId, { emporter,
 * surPlace }>, b2b: boolean }`. Les emplacements y étaient déjà une donnée
 * (clé = identifiant), mais les **modes** étaient deux champs nommés et le B2B
 * un drapeau. Trois conséquences, toutes payées :
 *
 * - un quatrième contexte de vente était **impossible** — le registre écartait
 *   en silence toute ligne dont le canal n'était pas l'un des trois ;
 * - lire « ce contexte est-il vendu ? » demandait de savoir lequel des trois on
 *   regardait, donc une branche ;
 * - aucune clé étrangère ne pouvait porter la référence à un emplacement,
 *   enfouie dans du `jsonb` — il a fallu un registre à part pour tenir le mur.
 *
 * L'ensemble de paires supprime les trois d'un coup, et c'est **la forme même
 * de la table** qui les stocke (`category_channel`, `product_channel`).
 *
 * ## Une clé absente n'est pas un faux
 *
 * On n'écrit que ce qui est vendu. L'absence de paire EST la donnée — même
 * motif que « non réglé » pour les taux.
 */
export type SalesChannels = readonly SoldChannel[];

/** Rien n'est vendu tant qu'on ne l'a pas dit. */
export function emptySalesChannels(): SalesChannels {
  return [];
}

/** La même paire, deux fois écrite ? Une seule ligne. */
function keyOf(channel: SoldChannel): string {
  return `${channel.pointOfSaleId} ${channel.context}`;
}

/**
 * Barrière avant persistance : dédoublonne et **ordonne**.
 *
 * L'ordre n'a pas de sens métier ; il en a pour la COMPARAISON. Le journal
 * inscrit un avant/après, et deux ensembles identiques écrits dans un ordre
 * différent produiraient un « changement » que personne n'a fait.
 */
export function normalizeSalesChannels(channels: SalesChannels): SalesChannels {
  const seen = new Map<string, SoldChannel>();
  for (const channel of channels) {
    seen.set(keyOf(channel), {
      pointOfSaleId: channel.pointOfSaleId,
      context: channel.context,
    });
  }
  return [...seen.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

/**
 * Ce contexte est-il vendu **quelque part** ?
 *
 * Aucune branche, et c'est tout l'intérêt : la fonction ne connaît aucun nom de
 * contexte, et ne se demande plus lequel aurait besoin d'un lieu.
 */
export function sellsContext(channels: SalesChannels, contextKey: string): boolean {
  return channels.some((channel) => channel.context === contextKey);
}

/** Les points de vente cités, sans doublon. */
export function referencedPointsOfSale(channels: SalesChannels): string[] {
  return [...new Set(channels.map((channel) => channel.pointOfSaleId))];
}

/** Les contextes vendus, sans doublon — ce que la fiche projette. */
export function soldContexts(channels: SalesChannels): string[] {
  return [...new Set(channels.map((channel) => channel.context))];
}

/** Ce point de vente vend-il ce contexte ? La question de l'écran, case par case. */
export function sellsAt(
  channels: SalesChannels,
  pointOfSaleId: string,
  contextKey: string,
): boolean {
  return channels.some(
    (channel) => channel.pointOfSaleId === pointOfSaleId && channel.context === contextKey,
  );
}

/**
 * L'**emplacement** d'un canal, tel que la colonne héritée l'attend.
 *
 * ⚠️ Code de TRANSITION (p-2, `documentation/pim/point-de-vente.md`). Les
 * lectures sont basculées, mais `location_id` reste écrite : pendant le
 * déploiement, le binaire de la version précédente la LIT encore, et cesser de
 * la remplir rendrait invisible tout ce qui est enregistré dans cette fenêtre.
 *
 * La règle est l'inverse exacte de celle de p-1 : une plateforme n'est pas un
 * lieu. p-3 supprime la colonne — et cette fonction avec.
 */
export function legacyLocationOf(channel: SoldChannel): string | null {
  return isRootPointOfSale(channel.pointOfSaleId) ? null : channel.pointOfSaleId;
}

/**
 * Le point de vente d'une LIGNE lue, colonne héritée comprise.
 *
 * ⚠️ Code de TRANSITION (p-2). `point_of_sale_id` est remplie depuis p-1, mais
 * une ligne écrite par le binaire précédent PENDANT le déploiement de p-1 ne
 * l'a pas. La retomber sur `location_id` évite de perdre ces lignes-là ; p-3
 * les rattrape par un dernier remplissage, puis pose le `NOT NULL` — et cette
 * fonction disparaît.
 */
export function pointOfSaleOfRow(row: {
  readonly pointOfSaleId: string | null;
  readonly locationId: string | null;
}): string {
  return row.pointOfSaleId ?? row.locationId ?? ROOT_POINT_OF_SALE_ID;
}
