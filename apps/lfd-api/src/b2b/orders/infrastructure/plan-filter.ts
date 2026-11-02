import type { Prisma } from "../../../platform/database/client/client.js";
import {
  PAYMENTS_AWAITING,
  PAYMENTS_REFUSED,
  STATUS_IN_PLAN,
  SUPPLY_PRODUCED,
} from "../domain/services/production-plan.js";

/**
 * **Le `where` du compte à produire**, écrit UNE fois.
 *
 * ## Pourquoi ce fichier existe
 *
 * 🔴 Quatre adaptateurs posaient chacun leur condition à la main, et rien ne les
 * empêchait de diverger — ce qui est arrivé. `absorbedByPlan` nommait pourtant
 * la règle depuis le début ; elle n'était appliquée nulle part. Ce fragment est
 * ce qui manquait entre les deux : le domaine décide, l'infrastructure traduit,
 * et les lecteurs se contentent de l'épandre.
 *
 * ⚠️ **Ils étaient CINQ, pas quatre** (constaté le 2026-09-17, le jour même). Le
 * dossier du jour — la liasse qu'on tire une fois la journée arrêtée — était la
 * surface oubliée du rassemblement : elle écartait les seules annulées. Elle
 * partage désormais {@link settlementWhere}, mais pas `planWhere` entier, et la
 * raison de cette moitié est écrite sur la fonction.
 *
 * ## Pourquoi il vit dans `infrastructure/` et pas dans le domaine
 *
 * Parce qu'il parle Prisma. Le domaine n'a pas le droit de le connaître
 * (`CLAUDE.md` §3 : aucun type Prisma ne franchit `infrastructure/`), et c'est
 * bien ainsi : il porte la RÈGLE — quels statuts, quels règlements — pendant que ce fichier n'en porte que la TRADUCTION.
 *
 * Il doit rester le miroir exact d'`absorbedByPlan`. Une divergence entre les
 * deux ne serait pas visible : le prédicat sert aux tests, le `where` sert à la
 * production, et personne ne les compare.
 */

/**
 * Ce que la journée absorbe, en une condition.
 *
 * Trois conditions, exactement celles du prédicat : le statut du plan, un
 * règlement ni mort (refusé, remboursé) ni en vol (`pending`), pour personne,
 * et une marchandise fabriquée pour elle.
 *
 * ⚠️ Jusqu'au 2026-09-22 (D2), l'attente valait pour qui avait un compte, et le
 * fragment portait un `OR` sur `clientele` avec une branche `null` explicite —
 * en SQL, `clientele <> 'public'` est FAUX sur `NULL`. La clientèle ne compte
 * plus : le `NULL` n'a plus rien à rattraper.
 *
 * Une commande prise sur la vitrine en est exclue ({@link notFromStock}) : la
 * fiche, le retirage, l'alerte de rattrapage, le prévisionnel et l'état du
 * jour la laissent dehors d'un coup (plan du jour J, §9.3, lot L1).
 */
export function planWhere(): Prisma.OrderWhereInput {
  return { status: STATUS_IN_PLAN, ...settlementWhere(), ...notFromStock() };
}

/**
 * 🔴 **L'argent seul**, pour qui n'a pas la condition de statut du plan.
 *
 * Traduction de {@link settlementAllowsProduction}, et la raison de la coupe est
 * écrite là-bas : le **dossier du jour** garde les commandes déjà prêtes ou
 * remises — sa pile numérotée est la preuve qu'il ne manque pas une feuille —
 * mais il n'a aucune raison d'imprimer un bon pour un règlement mort ou pour une
 * carte restée en l'air, pro ou visiteur (D2, 2026-09-22).
 *
 * ⚠️ **Ne pas fusionner avec `planWhere`** en donnant au dossier la condition
 * entière : `status: placed` le viderait dès l'arrêt de la journée, c'est-à-dire
 * au moment précis où on l'imprime.
 */
export function settlementWhere(): Prisma.OrderWhereInput {
  return {
    paymentStatus: { notIn: [...PAYMENTS_REFUSED, ...PAYMENTS_AWAITING] },
  };
}

/**
 * 🔴 **Pas une commande prise sur la vitrine** (plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §9.3, lot
 * L1) — traduction de {@link SUPPLY_PRODUCED}.
 *
 * Une commande `shelf` puise dans le stock du jour du point : elle n'a rien à
 * attendre du fournil ni du transport. Tout lecteur de PRODUCTION ou de
 * TRANSPORT la porte ; la file du comptoir, la remise, la facture et la
 * Supervision ne la portent PAS — elles doivent voir la commande.
 */
export function notFromStock(): Prisma.OrderWhereInput {
  return { supply: SUPPLY_PRODUCED };
}

/**
 * **Ce qu'un lecteur de production voit, sans la condition de statut du plan**
 * : l'argent ({@link settlementWhere}) et la marque ({@link notFromStock}).
 *
 * Pour le dossier du jour, les échéances du four et l'arrivée des transferts,
 * qui gardent leurs propres statuts. `settlementWhere` seul reste celui de la
 * Supervision, qui doit voir une commande sur stock (en retrait).
 */
export function productionWhere(): Prisma.OrderWhereInput {
  return { ...settlementWhere(), ...notFromStock() };
}
