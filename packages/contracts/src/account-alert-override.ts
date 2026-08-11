import { z } from "zod";

import { alertKindSchema, type AlertKind } from "./account-alert.js";
import { alertRuleSchema, type AlertRule } from "./account-alert-rule.js";

/**
 * Ce qu'un compte fait d'une règle globale. **Pas de ligne du tout** quand il la
 * suit : l'absence est l'état par défaut, et elle se lit sans ambiguïté.
 *
 * - `off` — ce type ne s'évalue pas sur ce compte ;
 * - `custom` — le compte porte **sa propre règle, complète**.
 *
 * Le mode `custom` copie l'intégralité de la règle, jamais un diff. Un override
 * partiel obligerait à répondre « que devient le champ à moitié dérogé quand le
 * global change ? », et il n'y a pas de bonne réponse. Tout-ou-rien : soit le
 * compte suit, soit il a sa règle, et on peut toujours dire laquelle il applique.
 */
export const accountAlertOverrideSchema = z
  .discriminatedUnion("mode", [
    z.object({ kind: alertKindSchema, mode: z.literal("off") }),
    z.object({ kind: alertKindSchema, mode: z.literal("custom"), rule: alertRuleSchema }),
  ])
  .refine((o) => o.mode === "off" || o.rule.params.kind === o.kind, {
    message: "La règle dérogée ne porte pas le type qu'elle prétend déroger",
    path: ["rule"],
  });
export type AccountAlertOverride = z.infer<typeof accountAlertOverrideSchema>;
export type AccountAlertOverrideMode = AccountAlertOverride["mode"];

/**
 * Une règle **vue depuis un compte** : ce que dit le global, ce que le compte en
 * fait, et ce qui s'applique réellement.
 *
 * Les trois voyagent **ensemble**, et `effective` est calculé **par le serveur**.
 * Le front n'implémente pas `dérogation ?? global` : deux implémentations de la
 * même résolution finiraient par diverger, et c'est l'affichage qui aurait tort
 * sans que rien ne le signale.
 */
export interface AccountAlertRuleView {
  readonly kind: AlertKind;
  /** Le réglage de la plateforme, rappelé tel quel — même quand on y déroge. */
  readonly global: AlertRule;
  /** `null` = ce compte suit le global. */
  readonly override: AccountAlertOverride | null;
  /** Ce qui sera réellement évalué sur ce compte. */
  readonly effective: AlertRule;
  /** Dernière écriture du réglage **global** (ISO), ou `null`. */
  readonly globalUpdatedAt: string | null;
  /** Dernière écriture de la **dérogation** (ISO), ou `null` s'il n'y en a pas. */
  readonly overrideUpdatedAt: string | null;
  /**
   * Le global a bougé **après** la dérogation. C'est le prix du tout-ou-rien :
   * un compte dérogé ne suit plus les évolutions de la plateforme, et sans ce
   * drapeau personne ne s'en apercevrait avant des mois.
   */
  readonly globalMovedSince: boolean;
  /**
   * La dérogation stockée était illisible : ce compte est traité comme **`off`**
   * (il avait explicitement dérogé — on ne sait pas ce qu'il voulait, mais on
   * sait qu'il ne voulait pas le global). L'écran doit le dire.
   */
  readonly degraded: boolean;
}

/**
 * Ce qui s'applique à un compte pour un type donné (pur, **une seule
 * implémentation**, côté serveur).
 *
 * `off` n'efface pas la règle : il l'éteint. On garde donc ses paramètres, ce qui
 * permet de les réafficher quand le staff la rallume, et de dire « désactivée »
 * plutôt que « vide ».
 */
export function effectiveAlertRule(
  global: AlertRule,
  override: AccountAlertOverride | null,
): AlertRule {
  if (override === null) {
    return global;
  }
  return override.mode === "off" ? { ...global, enabled: false } : override.rule;
}

/**
 * Deux règles disent-elles exactement la même chose ?
 *
 * Sert à **recoller** une dérogation redevenue identique au global : sans ça, un
 * aller-retour dans l'éditeur détachait le compte à vie — affiché « réglée pour
 * ce compte », contenu identique, et plus jamais aligné sur les évolutions de la
 * plateforme.
 *
 * Comparaison structurelle explicite plutôt qu'un `JSON.stringify` : deux objets
 * équivalents dont les clés sont dans un autre ordre ne sont pas différents.
 */
export function sameAlertRule(a: AlertRule, b: AlertRule): boolean {
  return (
    a.enabled === b.enabled &&
    a.delivery.staffInApp === b.delivery.staffInApp &&
    a.delivery.staffEmail === b.delivery.staffEmail &&
    a.delivery.customerVisible === b.delivery.customerVisible &&
    sameParams(a.params, b.params)
  );
}

function sameParams(a: AlertRule["params"], b: AlertRule["params"]): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  // Les paramètres sont des objets plats de scalaires + des tableaux de paliers
  // (eux-mêmes plats). Une comparaison de clés triées suffit et reste honnête.
  return stable(a) === stable(b);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stable(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([x], [y]) =>
      x.localeCompare(y),
    );
    return `{${entries.map(([key, item]) => `${key}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
