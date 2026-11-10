import { ALERT_KINDS, type AlertFinding, type AlertKind, type AlertRule } from "@lfd/contracts";

import type { AlertEvaluationContext } from "./detectors/context.js";
import { ORDER_DETECTORS } from "./detectors/registry.js";

/** Une alerte prête à persister : un type, et les lignes qui l'ont déclenchée. */
export interface AlertDraft {
  readonly kind: AlertKind;
  readonly findings: readonly AlertFinding[];
}

/**
 * Évalue une commande contre les règles **effectives** d'un compte (pur).
 *
 * Une alerte par (type × commande), jamais par ligne : un client qui élargit sa
 * gamme sur quinze références produirait quinze alertes, et la première vraie
 * utilisation noierait la liste. Le bruit est donc borné par construction — au
 * plus une alerte par type, quelle que soit la taille du panier.
 *
 * Les types dont le fait générateur n'est pas une commande sont écartés par leur
 * propre déclaration (`triggeredByOrder`), pas par une liste écrite ici : le jour
 * où un type change de déclencheur, un seul endroit bouge.
 */
export function evaluateOrder(
  context: AlertEvaluationContext,
  rules: ReadonlyMap<AlertKind, AlertRule>,
): AlertDraft[] {
  const drafts: AlertDraft[] = [];
  for (const [kind, rule] of rules) {
    if (!rule.enabled || !ALERT_KINDS[kind].triggeredByOrder) {
      continue;
    }
    const detector = ORDER_DETECTORS[kind];
    if (detector === undefined) {
      continue;
    }
    const findings = detector(context, rule.params);
    if (findings.length > 0) {
      drafts.push({ kind, findings });
    }
  }
  return drafts;
}

/**
 * La clé qui rend l'évaluation **idempotente** : (type, commande).
 *
 * Un événement rejoué — reprise de file, redémarrage, double publication — ne
 * doit pas doubler le journal. La clé ne porte pas les lignes : la même commande
 * réévaluée avec des seuils changés reste la même alerte, sinon un simple
 * ajustement de réglage repeuplerait tout l'historique.
 */
export function alertIdempotencyKey(kind: AlertKind, orderId: string): string {
  return `${kind}:${orderId}`;
}
