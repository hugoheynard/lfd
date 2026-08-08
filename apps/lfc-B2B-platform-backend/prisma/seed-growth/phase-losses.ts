import { seedCompany, validSiret } from "./phase-activation.js";
import { type SeedHarness } from "./harness.js";
import { persona } from "./personas.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Espace d'index dédié aux pertes (jamais en collision avec les autres personas). */
const LOSS_BASE = 40_000;

/** Résiliations par zone : le bastion churne le plus, les autres peu. */
const LOSSES: ReadonlyArray<{ codePostal: string; ville: string; count: number }> = [
  { codePostal: "73150", ville: "Val d'Isère", count: 22 },
  { codePostal: "73320", ville: "Tignes", count: 5 },
  { codePostal: "73700", ville: "Bourg-Saint-Maurice", count: 3 },
];

/** Une part de la distribution : (raison, sous-raison, détail optionnel, poids). */
interface Weight {
  readonly reason: string;
  readonly sub: string;
  /** 3ᵉ niveau (ex. catégorie produit sous `better_price`), vide sinon. */
  readonly detail?: string;
  /** Canal de rattrapage (rows `recovered` uniquement) : `auto` | `sales`. */
  readonly via?: "auto" | "sales";
  readonly count: number;
}

/**
 * **Résiliations confirmées** — distribution VOLONTAIREMENT contrastée (ratios
 * lisibles au sunburst). Le **concurrent** domine et se détaille jusqu'à la
 * **catégorie produit** sous « Meilleur prix » (3ᵉ anneau, boissons en tête) ; la
 * cessation suit ; tarif, qualité et le reste sont minoritaires. Somme = 30 =
 * total des `terminated` ci-dessus.
 */
const CONFIRMED: readonly Weight[] = [
  { reason: "competitor", sub: "better_price", detail: "beverages", count: 5 },
  { reason: "competitor", sub: "better_price", detail: "wine_spirits", count: 3 },
  { reason: "competitor", sub: "better_price", detail: "grocery", count: 1 },
  { reason: "competitor", sub: "better_price", detail: "fresh", count: 1 },
  { reason: "competitor", sub: "better_offer", count: 2 },
  { reason: "competitor", sub: "proximite", count: 2 },
  { reason: "closure", sub: "business_closure", count: 5 },
  { reason: "closure", sub: "relocation", count: 4 },
  { reason: "price", sub: "delivery_cost", count: 3 },
  { reason: "price", sub: "catalog_price", count: 1 },
  { reason: "quality", sub: "product_quality", count: 2 },
  { reason: "no_need", sub: "seasonal", count: 1 },
];

/**
 * **Tentatives rattrapées** — deux contrastes voulus : le taux de rattrapage DIFFÈRE
 * par catégorie (tarif très rattrapable, cessation quasi jamais) ET le **canal** de
 * rattrapage diffère (tarif surtout **auto** via un incentive plateforme ; concurrent
 * et qualité surtout **sales**, sauvés à la main par un commercial). Somme = 18.
 */
/**
 * **Délai de réaction** (jours) entre déclaration de résiliation et action de
 * rattrapage, par catégorie — consommé dans l'ordre : le tarif se négocie **vite**
 * (+ 1 outlier qui a traîné), le concurrent demande une contre-offre (moyen), la
 * qualité doit se corriger (**lent**). Longueur = nombre de rattrapées de la catégorie.
 */
const REACTION_DAYS: Record<string, readonly number[]> = {
  price: [1, 1, 2, 2, 3, 3, 4, 14],
  competitor: [3, 4, 5, 6, 7],
  quality: [9, 11, 16],
  no_need: [6],
  closure: [12],
};

const RECOVERED: readonly Weight[] = [
  { reason: "price", sub: "delivery_cost", via: "auto", count: 6 },
  { reason: "price", sub: "delivery_cost", via: "sales", count: 2 },
  { reason: "competitor", sub: "better_price", via: "sales", count: 4 },
  { reason: "competitor", sub: "better_price", via: "auto", count: 1 },
  { reason: "quality", sub: "product_quality", via: "sales", count: 3 },
  { reason: "no_need", sub: "seasonal", via: "auto", count: 1 },
  { reason: "closure", sub: "business_closure", via: "sales", count: 1 },
];

/** Une occurrence dépliée : raison + sous-raison + détail + canal de rattrapage. */
interface Part {
  readonly reason: string;
  readonly sub: string;
  readonly detail: string;
  readonly via: string;
}

/** Déplie une distribution pondérée en une liste plate de (raison, sous-raison, détail, canal). */
function flatten(dist: readonly Weight[]): readonly Part[] {
  const out: Part[] = [];
  for (const w of dist) {
    for (let i = 0; i < w.count; i += 1) {
      out.push({ reason: w.reason, sub: w.sub, detail: w.detail ?? "", via: w.via ?? "" });
    }
  }
  return out;
}

/**
 * **Calendrier des tentatives** (semaine 0 = la plus ancienne, 12 = la plus récente),
 * façonné pour une **vélocité de rattrapage croissante** : au début surtout des
 * confirmées (on subit), vers la fin de plus en plus de rattrapées (on réagit mieux).
 * Le taux hebdo passe de 0 % à ~60 %. Les longueurs valent les totaux (30 / 18).
 */
const CONF_WEEKS: readonly number[] = [
  0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12,
];
const RECOV_WEEKS: readonly number[] = [
  2, 3, 4, 5, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 12,
];

/** Date d'une tentative depuis son index de semaine (12 = ancre, 0 = 12 semaines avant). */
function weekDate(anchor: Date, weeks: readonly number[], index: number): Date {
  const week = weeks[index % weeks.length] ?? 12;
  return new Date(anchor.getTime() - (12 - week) * 7 * DAY_MS);
}

/**
 * Phase **pertes & terminaisons** : crée des sociétés **résiliées** par zone (barre
 * « Perte » de l'adoption) et enregistre les **terminaisons** avec une distribution
 * **contrastée** — sunburst raison → sous-raison aux ratios nets, et taux de
 * rattrapage variable par catégorie. Les tentatives sont **étalées dans le temps**
 * (cf. `CONF_WEEKS`/`RECOV_WEEKS`) pour une vélocité de rattrapage croissante.
 * Idempotent (SIRET + upsert). Les tentatives rattrapées ciblent des comptes actifs.
 */
export async function seedLosses(harness: SeedHarness, anchor: Date): Promise<number> {
  const confirmed = flatten(CONFIRMED);
  let created = 0;
  let k = 0;
  for (const zone of LOSSES) {
    for (let i = 0; i < zone.count; i += 1, k += 1) {
      const siret = validSiret(LOSS_BASE + k);
      const declaredAt = new Date(anchor.getTime() - ((k * 9) % 150) * DAY_MS);
      // Profondeur 3 : jusqu'à l'adresse de facturation (rattache la zone) — pas besoin
      // d'activer, on marque directement résilié.
      if (await seedCompany(harness, zoneWho(k, zone.codePostal, zone.ville), siret, 3, declaredAt)) {
        await harness.prisma.company.updateMany({ where: { siret }, data: { status: "terminated" } });
        created += 1;
      }
      const company = await harness.prisma.company.findFirst({ where: { siret }, select: { id: true } });
      const w = confirmed[k % confirmed.length];
      if (company !== null && w !== undefined) {
        await record(harness, `term_c_${k}`, company.id, w, k, "confirmed", weekDate(anchor, CONF_WEEKS, k), null);
      }
    }
  }
  await seedRecovered(harness, anchor);
  return created;
}

/** Tentatives **rattrapées** sur des comptes actifs du bastion, distribution pondérée. */
async function seedRecovered(harness: SeedHarness, anchor: Date): Promise<void> {
  const active = await harness.prisma.company.findMany({
    where: { status: "active", addresses: { some: { codePostal: "73150" } } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 40,
  });
  if (active.length === 0) {
    return;
  }
  const recovered = flatten(RECOVERED);
  const seen = new Map<string, number>();
  for (let j = 0; j < recovered.length; j += 1) {
    const w = recovered[j];
    const company = active[j % active.length];
    if (w === undefined || company === undefined) {
      continue;
    }
    const createdAt = weekDate(anchor, RECOV_WEEKS, j);
    const resolvedAt = new Date(createdAt.getTime() + reactionDays(w.reason, seen) * DAY_MS);
    await record(harness, `term_r_${j}`, company.id, w, j, "recovered", createdAt, resolvedAt);
  }
}

/** Prochain délai de réaction (jours) de la catégorie, consommé dans l'ordre déclaré. */
function reactionDays(reason: string, seen: Map<string, number>): number {
  const delays = REACTION_DAYS[reason] ?? [3];
  const n = seen.get(reason) ?? 0;
  seen.set(reason, n + 1);
  return delays[n % delays.length] ?? 3;
}

/** Upsert d'une terminaison (idempotent par id). `initiatedBy` alterné client/commercial. */
async function record(
  harness: SeedHarness,
  id: string,
  companyId: string,
  part: Part,
  index: number,
  outcome: "confirmed" | "recovered",
  createdAt: Date,
  resolvedAt: Date | null,
): Promise<void> {
  const data = {
    id,
    companyId,
    reason: part.reason,
    subReason: part.sub,
    detail: part.detail,
    initiatedBy: index % 3 === 0 ? "commercial" : "client",
    outcome,
    recoveredVia: outcome === "recovered" ? part.via : "",
    createdAt,
    resolvedAt,
  };
  await harness.prisma.companyTermination.upsert({ where: { id }, create: data, update: {} });
}

/** Persona déterministe forcé sur une zone (nom conservé, station réécrite). */
function zoneWho(k: number, codePostal: string, ville: string): ReturnType<typeof persona> {
  const base = persona(LOSS_BASE + k);
  const venue = base.businessName.split(" · ")[0];
  return { ...base, businessName: `${venue} · ${ville}`, stationLabel: ville, codePostal, ville };
}
