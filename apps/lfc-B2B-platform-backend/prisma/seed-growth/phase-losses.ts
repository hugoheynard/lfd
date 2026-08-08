import { seedCompany, validSiret } from "./phase-activation.js";
import { type SeedHarness } from "./harness.js";
import { buildLossPlan, type PlanPart, type RecoveredItem, WEEKS } from "./loss-plan.js";
import { persona } from "./personas.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Espace d'index dédié aux pertes (jamais en collision avec les autres personas). */
const LOSS_BASE = 40_000;

/**
 * Zones où la **perte** est affichée (barre « Perte » par territoire) : comptes FIXES —
 * les N premières résiliées y sont rattachées pour garder la perte par zone inchangée.
 */
const PERTE_ZONES: ReadonlyArray<{ codePostal: string; ville: string; count: number }> = [
  { codePostal: "73150", ville: "Val d'Isère", count: 22 },
  { codePostal: "73320", ville: "Tignes", count: 5 },
  { codePostal: "73700", ville: "Bourg-Saint-Maurice", count: 3 },
];
/** Les résiliées EN TROP (pour le volume sunburst/taux) tombent hors marché ciblé. */
const OFF_MARKET = { codePostal: "73000", ville: "Chambéry" };

/** Date d'une tentative depuis son index de semaine (WEEKS−1 = ancre, 0 = le plus ancien). */
function weekDate(anchor: Date, week: number): Date {
  return new Date(anchor.getTime() - (WEEKS - 1 - week) * 7 * DAY_MS);
}

/** Zone d'une confirmée par index : les premières remplissent les zones de perte. */
function zoneOf(index: number): { codePostal: string; ville: string } {
  let acc = 0;
  for (const z of PERTE_ZONES) {
    acc += z.count;
    if (index < acc) {
      return { codePostal: z.codePostal, ville: z.ville };
    }
  }
  return OFF_MARKET;
}

/**
 * Phase **pertes & terminaisons** : matérialise le {@link buildLossPlan} — sociétés
 * **résiliées** (barre « Perte » + sunburst) et tentatives **rattrapées** (taux + délai
 * de réaction), étalées dans le temps. Les zones de perte gardent des comptes fixes ;
 * les résiliées en trop tombent hors marché. Idempotent (SIRET + upsert par id).
 */
export async function seedLosses(harness: SeedHarness, anchor: Date): Promise<number> {
  const plan = buildLossPlan();
  let created = 0;
  for (let i = 0; i < plan.confirmed.length; i += 1) {
    const item = plan.confirmed[i];
    if (item !== undefined && (await seedConfirmed(harness, anchor, i, item.part, item.week))) {
      created += 1;
    }
  }
  await seedRecovered(harness, anchor, plan.recovered);
  return created;
}

/** Une société résiliée (profondeur 3 = adresse de facturation) + sa terminaison confirmée. */
async function seedConfirmed(
  harness: SeedHarness,
  anchor: Date,
  index: number,
  part: PlanPart,
  week: number,
): Promise<boolean> {
  const siret = validSiret(LOSS_BASE + index);
  const zone = zoneOf(index);
  const declaredAt = new Date(anchor.getTime() - ((index * 9) % 150) * DAY_MS);
  let created = false;
  if (await seedCompany(harness, zoneWho(index, zone.codePostal, zone.ville), siret, 3, declaredAt)) {
    await harness.prisma.company.updateMany({ where: { siret }, data: { status: "terminated" } });
    created = true;
  }
  const company = await harness.prisma.company.findFirst({ where: { siret }, select: { id: true } });
  if (company !== null) {
    await record(harness, `term_c_${index}`, company.id, part, index, "confirmed", weekDate(anchor, week), null);
  }
  return created;
}

/** Tentatives **rattrapées** sur des comptes actifs du bastion (délai = créé → résolu). */
async function seedRecovered(
  harness: SeedHarness,
  anchor: Date,
  recovered: readonly RecoveredItem[],
): Promise<void> {
  const active = await harness.prisma.company.findMany({
    where: { status: "active", addresses: { some: { codePostal: "73150" } } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 120,
  });
  if (active.length === 0) {
    return;
  }
  for (let j = 0; j < recovered.length; j += 1) {
    const item = recovered[j];
    const company = active[j % active.length];
    if (item === undefined || company === undefined) {
      continue;
    }
    const createdAt = weekDate(anchor, item.week);
    const resolvedAt = new Date(createdAt.getTime() + item.delayDays * DAY_MS);
    await record(harness, `term_r_${j}`, company.id, item.part, j, "recovered", createdAt, resolvedAt);
  }
}

/** Upsert d'une terminaison (idempotent par id). `initiatedBy` alterné client/commercial. */
async function record(
  harness: SeedHarness,
  id: string,
  companyId: string,
  part: PlanPart,
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
