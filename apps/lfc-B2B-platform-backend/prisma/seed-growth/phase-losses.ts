import { seedCompany, validSiret } from "./phase-activation.js";
import { type SeedHarness } from "./harness.js";
import { persona } from "./personas.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Espace d'index dédié aux pertes (jamais en collision avec les autres personas). */
const LOSS_BASE = 40_000;

/** Résiliations par zone : le bastion churne plus (plus de clients = plus de départs). */
const LOSSES: ReadonlyArray<{ codePostal: string; ville: string; count: number }> = [
  { codePostal: "73150", ville: "Val d'Isère", count: 12 },
  { codePostal: "73320", ville: "Tignes", count: 2 },
  { codePostal: "73700", ville: "Bourg-Saint-Maurice", count: 1 },
];

/** Cycle déterministe de raisons de départ (couvre tout le référentiel). */
const REASONS: readonly string[] = [
  "price",
  "competitor",
  "closure",
  "quality",
  "no_need",
  "unresponsive",
  "other",
];

/** Sous-raisons par raison (alignées sur la taxonomie du domaine). */
const SUBS: Readonly<Record<string, readonly string[]>> = {
  price: ["delivery_cost", "catalog_price", "no_incentive"],
  competitor: ["better_price", "better_offer"],
  closure: ["business_closure", "relocation"],
  quality: ["product_quality", "service", "delivery_reliability"],
  no_need: ["seasonal", "volume_drop"],
  unresponsive: ["unreachable"],
  other: ["other"],
};

/**
 * Phase **pertes & terminaisons** : crée des sociétés **résiliées** (`terminated`)
 * par zone (barre « Perte » de l'adoption) ET enregistre les **terminaisons** —
 * résiliations `confirmed` sur ces sociétés + une poignée de tentatives `recovered`
 * (rattrapées) sur des comptes actifs du bastion. Alimente le camembert des raisons
 * et le taux de rattrapage. Idempotent (SIRET + upsert des terminaisons).
 */
export async function seedLosses(harness: SeedHarness, anchor: Date): Promise<number> {
  let created = 0;
  let k = 0;
  for (const zone of LOSSES) {
    for (let i = 0; i < zone.count; i += 1, k += 1) {
      const siret = validSiret(LOSS_BASE + k);
      const declaredAt = new Date(anchor.getTime() - ((k * 9) % 150) * DAY_MS);
      if (await seedCompany(harness, zoneWho(k, zone.codePostal, zone.ville), siret, 5, declaredAt)) {
        await harness.prisma.company.updateMany({ where: { siret }, data: { status: "terminated" } });
        created += 1;
      }
      const company = await harness.prisma.company.findFirst({ where: { siret }, select: { id: true } });
      if (company !== null) {
        await recordTermination(harness, `term_${siret}`, company.id, k, "confirmed");
      }
    }
  }
  await seedRecoveredAttempts(harness);
  return created;
}

/** Tentatives **rattrapées** : des comptes actifs du bastion presque perdus, sauvés. */
async function seedRecoveredAttempts(harness: SeedHarness): Promise<void> {
  const saved = await harness.prisma.company.findMany({
    where: { status: "active", addresses: { some: { codePostal: "73150" } } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 10,
  });
  let j = 0;
  for (const company of saved) {
    await recordTermination(harness, `term_rec_${j}`, company.id, j, "recovered");
    j += 1;
  }
}

/** Upsert d'une terminaison (idempotent par id). `initiatedBy` alterné client/commercial. */
async function recordTermination(
  harness: SeedHarness,
  id: string,
  companyId: string,
  index: number,
  outcome: "confirmed" | "recovered",
): Promise<void> {
  const reason = REASONS[index % REASONS.length];
  const subs = SUBS[reason] ?? ["other"];
  const data = {
    id,
    companyId,
    reason,
    subReason: subs[index % subs.length],
    initiatedBy: index % 3 === 0 ? "commercial" : "client",
    outcome,
  };
  await harness.prisma.companyTermination.upsert({ where: { id }, create: data, update: {} });
}

/** Persona déterministe forcé sur une zone (nom conservé, station réécrite). */
function zoneWho(k: number, codePostal: string, ville: string): ReturnType<typeof persona> {
  const base = persona(LOSS_BASE + k);
  const venue = base.businessName.split(" · ")[0];
  return { ...base, businessName: `${venue} · ${ville}`, stationLabel: ville, codePostal, ville };
}
