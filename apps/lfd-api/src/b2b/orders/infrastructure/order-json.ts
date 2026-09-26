import type { OrderFulfillment, PriceStepView } from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";

/*
 * Les formes JSON qu'écrit la passation, sorties de `prisma-order.repository.ts`
 * pour qu'il reste sous les 300 lignes quand l'abandon du règlement y est entré
 * (2026-09-26). Aucune n'a changé en chemin.
 */

/**
 * L'acheminement convenu, en JSON **écrit explicitement**.
 *
 * Prisma refuse un type `readonly` comme valeur JSON, et un cast l'aurait fait
 * taire sans rien garantir. Recopier la forme ici la rend symétrique de
 * `orderFulfillmentSchema`, qui la relit : les deux bouts sont visibles côte à
 * côte, et un champ ajouté d'un seul côté se voit.
 */
export function toFulfillmentJson(agreed: OrderFulfillment): Prisma.InputJsonValue {
  return {
    window: {
      value: agreed.window.value === null ? null : { ...agreed.window.value },
      source: agreed.window.source,
    },
    contact: {
      value: agreed.contact.value === null ? null : { ...agreed.contact.value },
      source: agreed.contact.source,
    },
    signatureRequired: { ...agreed.signatureRequired },
  };
}

/**
 * Les étages, en JSON pur.
 *
 * Recopiés champ à champ plutôt que passés tels quels : `PriceStepView` est une
 * **interface**, et TypeScript ne leur accorde pas de signature d'index — donc
 * elle n'est pas assignable au type JSON de Prisma. Le mapping n'est pas une
 * cérémonie : il rend explicite ce qui part en base, et une nouvelle propriété
 * du domaine ne s'y invitera pas sans qu'on l'ait décidé.
 */
export function jsonSteps(steps: readonly PriceStepView[]): Prisma.InputJsonValue {
  return steps.map((step) => ({
    stage: step.stage,
    ruleId: step.ruleId,
    label: step.label,
    resultMillicents: step.resultMillicents,
    // 🔴 **Le champ que le lecteur attendait depuis le 2026-09-03.**
    //
    // `priceStepsSchema` le déclare défailli — `scope` à `null` — pour qu'une
    // trace ancienne reste lisible. Il n'était simplement **jamais écrit** : ce
    // mapping s'arrêtait à quatre champs, si bien que TOUTE trace persistée, y
    // compris celle de la commande passée à l'instant, relisait `scope: null`.
    // Un défaut posé pour lire le passé rendait le présent muet, et rien ne
    // pouvait rougir (R25, 2026-09-09).
    scope: step.scope === null ? null : { ...step.scope },
    // ⚠️ **`supersedes` n'est PAS écrit, et c'est délibéré.** Il porte le
    // LIBELLÉ COMMERCIAL des règles rivales — « Promo grands comptes −20 % ».
    // `GET /orders/mine`, `GET /orders/:id` et `GET /companies/:id/orders`
    // servent la trace au client **sans rétrécissement**, alors que
    // `POST /orders/quote` a été rétrécie exactement pour ça (cf. son JSDoc :
    // « les rivales qu'elle a évincées »). L'écrire ici enverrait au client le
    // nom des promotions qu'il n'a pas eues.
    //
    // Il attend donc le rétrécissement des trois routes client — un lot à part,
    // au registre. Rien d'autre ne le retient : le domaine le calcule, le
    // lecteur l'accueille.
  }));
}
