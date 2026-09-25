import type { FloorClientele } from "./entities/pricing-floor.js";
import type { PriceFloorPolicy } from "./floor-policy.js";
import type { VolumeLadder } from "./volume-ladder.js";
import type {
  PriceAudience,
  PriceAudienceType,
  PriceFloor,
  PriceRule,
  PriceScope,
  PriceScopeType,
  PriceStage,
} from "./price-rule.js";

/**
 * **Les phrases qu'un acte tarifaire fige** — sorties de `pricing-act.ts` le
 * 2026-09-19 (lot B du plan des phrases du journal), quand l'audience nommée
 * a fait passer le fichier au-delà de ce qu'une raison de changer justifie :
 * l'acte et son miroir d'un côté, les mots de l'autre.
 */

/**
 * Les noms du moment qu'une phrase de règle cite — lus par l'application
 * (`ruleNamesOf`), que ce fichier ne peut pas interroger.
 */
export interface RuleNames {
  /** La famille ou l'article visé ; `null` pour tout le catalogue, ou sans nom. */
  readonly scopeName: string | null;
  /** La société visée ; `null` pour une autre audience, ou sans nom. */
  readonly audienceName: string | null;
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

const AUDIENCE_WORDS: Readonly<Record<PriceAudienceType, string>> = {
  all: "tous clients",
  segment: "segment",
  company: "client",
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
 *
 * @param names les noms **du moment** de la famille ou de l'article visé, et
 *   de la société visée — lus par l'appelant, que ce fichier ne peut pas
 *   interroger. La phrase citait les identifiants bruts (« famille
 *   viennoiserie », « produit P-7K2 », « cmp_01J… ») : illisibles à la
 *   relecture, et faux le jour où l'objet change de nom (plan des phrases du
 *   journal, lot B).
 */
export function describeRule(rule: PriceRule, names: RuleNames): string {
  return [
    `${STAGE_WORDS[rule.stage]} « ${rule.label} »`,
    describeEffect(rule),
    describeTarget(rule, names),
    describeWindow(rule),
  ].join(" · ");
}

/**
 * **Une portée, en mots** : « tout le catalogue », « famille « Viennoiseries » ».
 * C'est aussi le nom du sujet d'une limite, dont la portée EST le sujet.
 */
export function describeScope(scope: PriceScope, scopeName: string | null): string {
  if (scope.id === null) {
    return SCOPE_WORDS[scope.type];
  }
  // Sans nom, l'identifiant — ce que la phrase disait avant le lot B : on
  // n'invente pas un nom qu'on n'a pas.
  return scopeName === null
    ? `${SCOPE_WORDS[scope.type]} ${scope.id}`
    : `${SCOPE_WORDS[scope.type]} « ${scopeName} »`;
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

const CLIENTELE_WORDS: Readonly<Record<FloorClientele, string>> = {
  pro: "Limite pro",
  public: "Limite publique",
};

/**
 * La phrase du journal pour un geste sur une limite : sa **clientèle**, puis sa
 * politique (`plan-limites-de-prix.md` §4). Relire « mur à 60 % » sans savoir
 * qui il protège laisserait croire qu'une limite publique a borné un prix pro.
 */
export function describeFloor(clientele: FloorClientele, policy: PriceFloorPolicy): string {
  return `${CLIENTELE_WORDS[clientele]} · ${describeFloorPolicy(policy)}`;
}

function floorAmount(floor: PriceFloor): string {
  return floor.mode === "amount" ? euros(floor.millicents) : `${percent(floor.bp)} % du tarif`;
}

function ratio(bp: number): string {
  return (bp / 10_000).toFixed(2).replace(".", ",");
}

function describeEffect(rule: PriceRule): string {
  if (rule.nature === "replace") {
    return `prix posé à ${euros(rule.amountMillicents)}`;
  }
  const sign = rule.alteration.direction === "decrease" ? "−" : "+";
  return rule.alteration.mode === "percent"
    ? `${sign}${percent(rule.alteration.bp)} %`
    : `${sign}${euros(rule.alteration.millicents)}`;
}

function describeTarget(rule: PriceRule, names: RuleNames): string {
  const scope = describeScope(rule.scope, names.scopeName);
  const audience = describeAudience(rule.audience, names.audienceName);
  const quantity = rule.minQuantity === null ? null : `dès ${String(rule.minQuantity)}`;
  return [scope, audience, quantity].filter((part) => part !== null).join(", ");
}

/**
 * **Qui la règle vise, en mots** : « tous clients », « client « Le Comptoir » ».
 * Un segment n'a pas d'autre nom que son code ; une société que l'annuaire ne
 * nomme pas garde son identifiant — on n'invente pas un nom qu'on n'a pas.
 */
function describeAudience(audience: PriceAudience, audienceName: string | null): string {
  if (audience.id === null) {
    return "tous clients";
  }
  if (audience.type === "company" && audienceName !== null) {
    return `client « ${audienceName} »`;
  }
  return `${AUDIENCE_WORDS[audience.type]} ${audience.id}`;
}

function describeWindow(rule: PriceRule): string {
  return describeWindowOf(rule.validFrom, rule.validTo);
}

/**
 * **Une fenêtre de validité, en mots** : « du 1er septembre 2026 au
 * 30 septembre 2026 », « du 1er septembre 2026, sans date de fin ».
 *
 * Partagée par toutes les phrases figées de la tarification — règle, barème,
 * mercuriale : la mercuriale écrivait « du 2026-09-01 au sans terme », et un
 * même journal ne doit dire une fenêtre que d'une façon. Les bornes sont
 * écrites telles qu'elles sont stockées : aucun jour n'est recalculé.
 */
export function describeWindowOf(validFrom: Date, validTo: Date | null): string {
  const from = `du ${day(validFrom)}`;
  return validTo === null ? `${from}, sans date de fin` : `${from} au ${day(validTo)}`;
}

/**
 * **Un nombre d'articles, accordé** : « 1 article », « 12 articles ».
 * La phrase figée écrivait « article(s) », que personne ne dit.
 */
export function describeArticleCount(count: number): string {
  return `${String(count)} ${count > 1 ? "articles" : "article"}`;
}

/**
 * Les prix sont en **millicentimes** entiers et le restent : la division ne sert
 * qu'à l'affichage, dans une phrase qui ne sera jamais recalculée.
 *
 * Elle divisait par 100. Les trois valeurs qu'elle reçoit — le prix posé d'une
 * mercuriale, un plancher en montant, une altération en euros — sont des PRIX
 * UNITAIRES, donc en millicentimes depuis toujours : le journal annonçait
 * « 1800,00 € » pour une mercuriale posée à 1,80 €. Personne ne l'avait vu parce
 * qu'on relit un journal après coup, jamais pendant qu'on saisit.
 */
function euros(millicents: number): string {
  return `${(millicents / 100_000).toFixed(2).replace(".", ",")} €`;
}

function percent(bp: number): string {
  return String(bp / 100).replace(".", ",");
}

const LONG_DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

/** Le seul quantième qui s'écrit en ordinal en français. */
const FIRST_OF_MONTH = "1";

/**
 * Le jour civil **à Paris**, en toutes lettres : « 1er septembre 2026 ».
 *
 * Le fuseau est explicite — le journal ne doit pas dépendre de celui du
 * serveur. Elle rendait « 01/09/2026 », qu'un lecteur habitué à l'ordre
 * anglais lit à l'envers ; le mois en lettres ne se lit que d'une façon.
 */
function day(date: Date): string {
  const parts = LONG_DAY.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const dayOfMonth = part("day");
  return `${dayOfMonth === FIRST_OF_MONTH ? "1er" : dayOfMonth} ${part("month")} ${part("year")}`;
}
