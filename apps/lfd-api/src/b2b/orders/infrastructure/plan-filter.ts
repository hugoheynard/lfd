import type { Prisma } from "../../../platform/database/client/client.js";
import {
  PAYMENTS_AWAITING,
  PAYMENTS_REFUSED,
  STATUS_IN_PLAN,
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
 * Deux conditions, exactement celles du prédicat : le statut du plan, et un
 * règlement ni mort (refusé, remboursé) ni en vol (`pending`), pour personne.
 *
 * ⚠️ Jusqu'au 2026-09-22 (D2), l'attente valait pour qui avait un compte, et le
 * fragment portait un `OR` sur `clientele` avec une branche `null` explicite —
 * en SQL, `clientele <> 'public'` est FAUX sur `NULL`. La clientèle ne compte
 * plus : le `NULL` n'a plus rien à rattraper.
 */
export function planWhere(): Prisma.OrderWhereInput {
  return { status: STATUS_IN_PLAN, ...settlementWhere() };
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
