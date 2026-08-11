import {
  ALERT_KINDS,
  type AlertFinding,
  type AlertKind,
  type AlertRule,
  type OrderPreflightWarning,
} from "@lfd/contracts";

import type { AlertDraft } from "./evaluate-order.js";

/**
 * Ce qu'on **montre au client**, à partir de ce que les détecteurs ont constaté.
 *
 * Deux conditions, dans cet ordre, et les deux sont nécessaires : le type doit
 * être **montrable** (c'est du code — `first_order` ne l'est pas, l'aberration
 * produit non plus, sa référence étant la médiane des autres comptes), et la
 * règle effective doit l'avoir **coché** (c'est de la donnée). Un type montrable
 * mais non coché reste un signal interne.
 *
 * La phrase est **réécrite ici**, jamais celle du staff : « écart +180 % vs
 * moyenne 4,3 sur 6 commandes » est du vocabulaire de commercial. Le client, lui,
 * a besoin d'une seule chose — le nombre qu'il tape, comparé au sien.
 *
 * **Au plus un avertissement par ligne.** Deux règles qui parlent du même produit
 * n'ont qu'une place sous la ligne, et empiler deux phrases transformerait un
 * garde-fou en reproche.
 */
export function customerWarnings(
  drafts: readonly AlertDraft[],
  rules: ReadonlyMap<AlertKind, AlertRule>,
): OrderPreflightWarning[] {
  const bySku = new Map<string, OrderPreflightWarning>();
  for (const draft of drafts) {
    if (!shownToCustomer(draft.kind, rules.get(draft.kind))) {
      continue;
    }
    for (const finding of draft.findings) {
      const message = customerMessage(finding);
      if (message !== null && !bySku.has(finding.sku)) {
        bySku.set(finding.sku, { sku: finding.sku, message });
      }
    }
  }
  return [...bySku.values()];
}

function shownToCustomer(kind: AlertKind, rule: AlertRule | undefined): boolean {
  return rule !== undefined && rule.delivery.customerVisible && ALERT_KINDS[kind].customerShowable;
}

/**
 * La phrase, écrite du point de vue du client : **sa** référence, puis ce que ce
 * panier porte. Pas de pourcentage — un écart en pourcentage est une mesure, pas
 * une aide à la saisie.
 *
 * Le produit n'est pas nommé : le callout se pose sous la ligne, qui le nomme
 * déjà juste au-dessus. `null` quand il n'y a pas de référence à opposer — sans
 * elle, la phrase n'apprendrait rien.
 */
function customerMessage(finding: AlertFinding): string | null {
  if (finding.baseline === null) {
    return null;
  }
  return `Habituellement ${format(finding.baseline)} — cette commande en porte ${format(finding.quantity)}.`;
}

/** Les décimales à la française, et pas de « ,0 » sur un entier. */
function format(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toString().replace(".", ",");
}
