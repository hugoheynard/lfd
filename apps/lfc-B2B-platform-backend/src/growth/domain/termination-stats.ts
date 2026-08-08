import type {
  TerminationReason,
  TerminationReasonNode,
  TerminationRecovery,
  TerminationStatsView,
  TerminationSubReasonCount,
} from "@lfd/contracts";

/** Ligne brute d'une terminaison (lecture). */
export interface TerminationRow {
  readonly reason: string;
  readonly subReason: string;
  /** 3ᵉ niveau optionnel (ex. catégorie produit sous `better_price`). */
  readonly detail: string;
  readonly outcome: string;
  /** Pour un `recovered` : `auto` (plateforme) | `sales` (commercial), vide sinon. */
  readonly recoveredVia: string;
}

/** Compteurs de rattrapage d'une catégorie : total + décomposition par canal. */
interface RecoveryTally {
  attempts: number;
  recovered: number;
  auto: number;
  sales: number;
}

/** Un nœud de la taxonomie : un code, un libellé, d'éventuels sous-niveaux. */
interface Sub {
  readonly code: string;
  readonly label: string;
  readonly subs?: readonly Sub[];
}

/**
 * Taxonomie des raisons de départ (v1 en dur ; référentiel « activité »-like plus
 * tard). Profondeur variable : la plupart des sous-raisons sont des feuilles, mais
 * **« Meilleur prix ailleurs »** se détaille en **catégorie produit** (3ᵉ anneau).
 * Codes inconnus à un niveau retombent sur « Non précisé ».
 */
const TAXONOMY: ReadonlyArray<{ reason: TerminationReason; label: string; subs: readonly Sub[] }> =
  [
    {
      reason: "price",
      label: "Tarif",
      subs: [
        { code: "delivery_cost", label: "Livraison trop chère" },
        { code: "catalog_price", label: "Catalogue trop cher" },
        { code: "no_incentive", label: "Manque d'incentive" },
      ],
    },
    {
      reason: "competitor",
      label: "Concurrent",
      subs: [
        {
          code: "better_price",
          label: "Meilleur prix ailleurs",
          subs: [
            { code: "beverages", label: "Boissons" },
            { code: "wine_spirits", label: "Vins & spiritueux" },
            { code: "grocery", label: "Épicerie" },
            { code: "fresh", label: "Frais / traiteur" },
          ],
        },
        { code: "better_offer", label: "Meilleure offre / service" },
        { code: "proximite", label: "Concurrent de proximité" },
      ],
    },
    {
      reason: "closure",
      label: "Cessation d'activité",
      subs: [
        { code: "business_closure", label: "Fermeture" },
        { code: "relocation", label: "Déménagement hors zone" },
      ],
    },
    {
      reason: "quality",
      label: "Qualité / service",
      subs: [
        { code: "product_quality", label: "Qualité produit" },
        { code: "service", label: "Service / SAV" },
        { code: "delivery_reliability", label: "Fiabilité livraison" },
      ],
    },
    {
      reason: "no_need",
      label: "Plus de besoin",
      subs: [
        { code: "seasonal", label: "Fin de saison" },
        { code: "volume_drop", label: "Baisse d'activité" },
      ],
    },
    {
      reason: "unresponsive",
      label: "Injoignable",
      subs: [{ code: "unreachable", label: "Injoignable" }],
    },
    { reason: "other", label: "Autre", subs: [{ code: "other", label: "Autre" }] },
  ];

const REASONS = TAXONOMY.map((t) => ({ reason: t.reason, label: t.label }));
const KNOWN = new Set<string>(REASONS.map((r) => r.reason));
const UNSPECIFIED = "Non précisé";

/** Arbre de comptes : un total à ce nœud + ses enfants par code (« » = non précisé). */
interface CountTree {
  count: number;
  readonly children: Map<string, CountTree>;
}

/**
 * **Analytics de churn** (pure) : le **sunburst** des résiliations confirmées
 * (raison → sous-raison → détail) et le **taux de rattrapage** (rattrapées /
 * tentatives) global et par catégorie. Codes inconnus retombent sur `other` /
 * « Non précisé ». Déterministe.
 */
export function computeTerminationStats(rows: readonly TerminationRow[]): TerminationStatsView {
  const tally = new Map<TerminationReason, RecoveryTally>();
  const root: CountTree = { count: 0, children: new Map() };
  for (const row of rows) {
    const reason = normalizeReason(row.reason);
    tallyRow(tally, reason, row);
    if (row.outcome !== "recovered") {
      insert(root, rowPath(reason, row.subReason, row.detail));
    }
  }
  return {
    reasons: buildReasons(root),
    recovery: recovery("all", "Global", sumTally(tally)),
    recoveryByReason: REASONS.map((r) => recovery(r.reason, r.label, tally.get(r.reason))).filter(
      (r) => r.attempts > 0,
    ),
  };
}

/** Comptabilise une ligne : +1 tentative, et si rattrapée, +1 dans le canal (auto/sales). */
function tallyRow(
  map: Map<TerminationReason, RecoveryTally>,
  reason: TerminationReason,
  row: TerminationRow,
): void {
  const t = map.get(reason) ?? { attempts: 0, recovered: 0, auto: 0, sales: 0 };
  t.attempts += 1;
  if (row.outcome === "recovered") {
    t.recovered += 1;
    if (row.recoveredVia === "sales") {
      t.sales += 1;
    } else {
      t.auto += 1;
    }
  }
  map.set(reason, t);
}

/** Agrège tous les compteurs de catégorie en un total (rattrapage global). */
function sumTally(map: Map<TerminationReason, RecoveryTally>): RecoveryTally {
  const all: RecoveryTally = { attempts: 0, recovered: 0, auto: 0, sales: 0 };
  for (const t of map.values()) {
    all.attempts += t.attempts;
    all.recovered += t.recovered;
    all.auto += t.auto;
    all.sales += t.sales;
  }
  return all;
}

/** Chemin de codes d'une ligne, snappé sur la taxonomie (code inconnu → « »). */
function rowPath(reason: TerminationReason, subRaw: string, detailRaw: string): readonly string[] {
  const sub = subsOf(reason).find((s) => s.code === subRaw);
  if (sub === undefined) {
    return [reason, ""];
  }
  if (sub.subs !== undefined && sub.subs.length > 0) {
    const detail = sub.subs.find((d) => d.code === detailRaw);
    return [reason, sub.code, detail?.code ?? ""];
  }
  return [reason, sub.code];
}

/** Incrémente le total à chaque nœud le long du chemin (crée les manquants). */
function insert(node: CountTree, path: readonly string[]): void {
  node.count += 1;
  const [head, ...rest] = path;
  if (head === undefined) {
    return;
  }
  let child = node.children.get(head);
  if (child === undefined) {
    child = { count: 0, children: new Map() };
    node.children.set(head, child);
  }
  insert(child, rest);
}

/** Arbre raison → sous-raisons (→ détail), trié par poids, niveaux vides exclus. */
function buildReasons(root: CountTree): TerminationReasonNode[] {
  const nodes: TerminationReasonNode[] = [];
  for (const t of TAXONOMY) {
    const node = root.children.get(t.reason);
    if (node === undefined || node.count === 0) {
      continue;
    }
    nodes.push({
      reason: t.reason,
      label: t.label,
      count: node.count,
      children: buildChildren(t.subs, node),
    });
  }
  return nodes;
}

/** Enfants labellisés d'un nœud (récursif), triés par compte décroissant. */
function buildChildren(subs: readonly Sub[], node: CountTree): TerminationSubReasonCount[] {
  const out: TerminationSubReasonCount[] = [];
  for (const [code, child] of node.children) {
    if (child.count === 0) {
      continue;
    }
    const sub = subs.find((s) => s.code === code);
    const label = sub?.label ?? (code === "" ? UNSPECIFIED : code);
    const grandChildren =
      sub?.subs !== undefined && sub.subs.length > 0 ? buildChildren(sub.subs, child) : [];
    out.push({
      subReason: code,
      label,
      count: child.count,
      ...(grandChildren.length > 0 ? { children: grandChildren } : {}),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Sous-raisons déclarées pour une catégorie. */
function subsOf(reason: TerminationReason): readonly Sub[] {
  return TAXONOMY.find((t) => t.reason === reason)?.subs ?? [];
}

/** Construit un `TerminationRecovery` depuis un compteur (tally vide → zéros). */
function recovery(
  reason: TerminationReason | "all",
  label: string,
  tally: RecoveryTally | undefined,
): TerminationRecovery {
  const t = tally ?? { attempts: 0, recovered: 0, auto: 0, sales: 0 };
  return {
    reason,
    label,
    attempts: t.attempts,
    recovered: t.recovered,
    recoveredAuto: t.auto,
    recoveredSales: t.sales,
    rate: t.attempts > 0 ? t.recovered / t.attempts : 0,
  };
}

function normalizeReason(raw: string): TerminationReason {
  return KNOWN.has(raw) ? (raw as TerminationReason) : "other";
}
