import type { PriceFloorPolicy } from "./floor-policy.js";
import type { VolumeLadder } from "./volume-ladder.js";
import type { PriceFloor, PriceRule, PriceScopeType, PriceStage } from "./price-rule.js";

/**
 * **Un acte sur la tarification** — l'unité du journal.
 *
 * Sur un prix négocié, la question posée six mois plus tard n'est jamais « quelle
 * était la règle ? » : c'est **« qui a décidé ça, et qui l'a arrêté »**. La
 * réponse ne peut pas se déduire de l'état courant, puisque l'état courant est
 * précisément ce qui a remplacé la réponse. Il faut donc l'écrire au moment où
 * elle est encore vraie.
 *
 * Le journal est **strictement additif** : aucun port n'expose de modification
 * ni d'effacement. Un journal qu'on peut réécrire ne prouve rien — et le premier
 * jour où il servirait vraiment serait justement celui où quelqu'un aurait
 * intérêt à le corriger.
 */

export const PRICING_ACTS = [
  "posed",
  "paused",
  "resumed",
  "archived",
  "confirmed",
  "replaced",
  /**
   * **Renommé** — et rien d'autre.
   *
   * Un acte distinct de `replaced` parce qu'il ne change AUCUN prix : il corrige
   * la phrase que le client lira. Les confondre ferait chercher un changement
   * tarifaire là où il n'y en a pas eu, le jour où on relit le journal pour
   * comprendre une facture.
   */
  "renamed",
] as const;
export type PricingActKind = (typeof PRICING_ACTS)[number];

export type PricingSubjectType = "rule" | "floor" | "ladder";

export interface PricingAct {
  readonly subjectType: PricingSubjectType;
  readonly subjectId: string;
  readonly kind: PricingActKind;
  /** Le `sub` du membre du staff. `system` pour un acte non humain. */
  readonly actor: string;
  readonly at: Date;
  /** Ce que l'auteur a écrit, quand l'écran le lui a demandé. */
  readonly reason: string | null;
  /**
   * **Ce que la décision disait**, en une phrase figée au moment de l'acte.
   *
   * Figée, et non recalculée à la lecture : la règle peut avoir changé, avoir
   * été archivée, ou avoir disparu du vocabulaire de l'écran. Un journal qui
   * rendrait la phrase d'aujourd'hui pour un acte d'hier raconterait l'histoire
   * à l'envers.
   */
  readonly summary: string;
}

/**
 * Les mots du journal, **à lui**.
 *
 * Redéclarés plutôt qu'importés du contrat de fil, et pour une fois la
 * duplication est le but : la phrase est figée à l'écriture, donc elle doit
 * survivre au jour où l'écran renommera « geste » en autre chose. Un journal qui
 * suivrait le vocabulaire courant réécrirait le passé à chaque renommage.
 */
const STAGE_WORDS: Readonly<Record<PriceStage, string>> = {
  mercuriale: "Mercuriale",
  volume: "Volume",
  promotion: "Promotion",
  geste: "Geste",
};

const SCOPE_WORDS: Readonly<Record<PriceScopeType, string>> = {
  global: "tout le catalogue",
  category: "famille",
  product: "produit",
  variant: "déclinaison",
};

/**
 * La phrase que le journal gardera d'une règle.
 *
 * Elle nomme les quatre choses qu'on cherche en relisant : ce qu'elle fait, ce
 * qu'elle vise, qui elle vise, et jusqu'à quand. Le libellé commercial y figure
 * parce que c'est sous ce nom que le staff en parle au téléphone.
 */
export function describeRule(rule: PriceRule): string {
  return [
    `${STAGE_WORDS[rule.stage]} « ${rule.label} »`,
    describeEffect(rule),
    describeTarget(rule),
    describeWindow(rule),
  ].join(" · ");
}

/**
 * La phrase que le journal gardera d'un barème de volume.
 *
 * Les paliers y figurent **tous**, dans l'ordre : c'est l'échelle entière qui a
 * été décidée, et relire « 50+ à −5 % » sans savoir ce qui suivait ne dirait
 * rien de ce qu'on avait accordé.
 */
export function describeLadder(ladder: VolumeLadder): string {
  const tiers = ladder.tiers
    .map(
      (tier) =>
        `${String(tier.minQuantity)}+ à −${ladder.unit === "percent" ? `${percent(tier.value)} %` : euros(tier.value)}`,
    )
    .join(", ");
  return `Barème « ${ladder.label} » · ${tiers} · ${describeWindowOf(ladder.validFrom, ladder.validTo)}`;
}

/**
 * La phrase que le journal gardera d'une limite.
 *
 * Le mur d'abord, la porte ensuite et seulement si elle existe : c'est l'ordre
 * dans lequel on relit une limite, et l'ordre dans lequel elle mord.
 */
export function describeFloorPolicy(policy: PriceFloorPolicy): string {
  const wall = `mur à ${floorAmount(policy.hard)}`;
  if (policy.dynamic === null) {
    return wall;
  }
  const { floor, unlock } = policy.dynamic;
  const keys = [
    unlock.minQuantity === null ? null : `dès ${String(unlock.minQuantity)} pièces`,
    unlock.minVolumeRatioBp === null ? null : `volume ×${ratio(unlock.minVolumeRatioBp)}`,
  ].filter((part) => part !== null);
  return `${wall} · porte à ${floorAmount(floor)} (${keys.join(" et ")})`;
}

function floorAmount(floor: PriceFloor): string {
  return floor.mode === "amount" ? euros(floor.cents) : `${percent(floor.bp)} % du tarif`;
}

function ratio(bp: number): string {
  return (bp / 10_000).toFixed(2).replace(".", ",");
}

function describeEffect(rule: PriceRule): string {
  if (rule.nature === "replace") {
    return `prix posé à ${euros(rule.amountCents)}`;
  }
  const sign = rule.alteration.direction === "decrease" ? "−" : "+";
  return rule.alteration.mode === "percent"
    ? `${sign}${percent(rule.alteration.bp)} %`
    : `${sign}${euros(rule.alteration.cents)}`;
}

function describeTarget(rule: PriceRule): string {
  const scope =
    rule.scope.id === null
      ? SCOPE_WORDS[rule.scope.type]
      : `${SCOPE_WORDS[rule.scope.type]} ${rule.scope.id}`;
  const audience = rule.audience.id === null ? "tous clients" : rule.audience.id;
  const quantity = rule.minQuantity === null ? null : `dès ${String(rule.minQuantity)}`;
  return [scope, audience, quantity].filter((part) => part !== null).join(", ");
}

function describeWindow(rule: PriceRule): string {
  return describeWindowOf(rule.validFrom, rule.validTo);
}

function describeWindowOf(validFrom: Date, validTo: Date | null): string {
  const from = day(validFrom);
  return validTo === null ? `à partir du ${from}` : `du ${from} au ${day(validTo)}`;
}

/**
 * Les montants sont en centimes entiers et le restent : la division ne sert
 * qu'à l'affichage, dans une phrase qui ne sera jamais recalculée.
 */
function euros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function percent(bp: number): string {
  return String(bp / 100).replace(".", ",");
}

/** `fr-FR` explicite : le journal ne doit pas dépendre du fuseau du serveur. */
function day(date: Date): string {
  return date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
}

/**
 * **Le fait générique** que porte un acte tarifaire.
 *
 * La tarification a son propre journal — plus riche que le général : il porte le
 * motif écrit par l'agent et la phrase figée de ce que la décision disait. On ne
 * le remplace pas. Mais un fait qui ne vit que dans la table d'un domaine reste
 * invisible de l'écran qui répond à « qui a fait quoi », et une remise consentie
 * sur un prix négocié est exactement ce qu'on y cherche.
 *
 * D'où le miroir : **un seul écrivain**, le dépôt, dans **une seule
 * transaction**, vers deux destinations qui ne répondent pas à la même question.
 * Deux lignes pour un acte, jamais deux vérités — elles ne peuvent pas diverger,
 * elles tombent ensemble.
 */
const FACT_PREFIX: Readonly<Record<PricingSubjectType, string>> = {
  rule: "price_rule",
  floor: "price_floor",
  ladder: "volume_ladder",
};

/** Le sujet du journal général, aligné sur le préfixe du fait. */
const FACT_SUBJECT: Readonly<Record<PricingSubjectType, string>> = FACT_PREFIX;

export function pricingFactOf(act: PricingAct): {
  readonly type: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
} {
  return {
    type: `${FACT_PREFIX[act.subjectType]}.${act.kind}`,
    subjectType: FACT_SUBJECT[act.subjectType],
    subjectId: act.subjectId,
    // La phrase figée et le motif : c'est tout ce que le journal général a à
    // dire d'un acte tarifaire. Le détail de la règle vit dans sa table, et
    // l'y recopier ferait du journal une seconde base.
    payload: { summary: act.summary, reason: act.reason },
    occurredAt: act.at,
  };
}
