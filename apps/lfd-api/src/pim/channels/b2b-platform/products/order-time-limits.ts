import type { SyncOrderTimeLimitRule } from "@lfd/catalog-sync";
import type { OrderTimeLimitView } from "@lfd/pim-contracts";

/**
 * **Une règle du référentiel → une règle du fil.**
 *
 * La conversion est explicite alors que `OrderTimeLimitView` satisfait déjà la
 * forme du fil — et c'est tout l'intérêt : la vue porte en plus son
 * identifiant et son `scopeLabel`, c'est-à-dire le NOM de la famille visée.
 * Passer la vue telle quelle aurait laissé ces deux champs entrer dans le
 * snapshot, donc dans son empreinte : renommer une famille aurait produit une
 * livraison, et le récepteur aurait reçu une clé qui ne lui sert à rien.
 *
 * Le typage ne l'aurait pas vu — TypeScript accepte le surplus dès que l'objet
 * n'est pas un littéral. C'est exactement le genre de fuite qu'une projection
 * doit refuser à la main.
 *
 * Cette fonction remplace `resolveLimitsByVariant`, qui descendait l'échelle ici
 * pour n'envoyer que des valeurs. La v7 envoie les rangs ; la descente vit
 * désormais dans `@lfd/catalog-sync`, partagée par les deux rives.
 */
export function toSyncRule(rule: OrderTimeLimitView): SyncOrderTimeLimitRule {
  return {
    scope: { type: rule.scope.type, id: rule.scope.id },
    daysBefore: rule.daysBefore,
    time: rule.time,
    graceMinutes: rule.graceMinutes,
  };
}
