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
 * **Tentatives rattrapées** — le taux de rattrapage DIFFÈRE par catégorie : tarif
 * très rattrapable, cessation quasi jamais. Somme = 18.
 */
const RECOVERED: readonly Weight[] = [
  { reason: "price", sub: "delivery_cost", count: 8 },
  { reason: "competitor", sub: "better_price", count: 5 },
  { reason: "quality", sub: "product_quality", count: 3 },
  { reason: "no_need", sub: "seasonal", count: 1 },
  { reason: "closure", sub: "business_closure", count: 1 },
];

/** Une occurrence dépliée : raison + sous-raison + détail (vide si feuille). */
interface Part {
  readonly reason: string;
  readonly sub: string;
  readonly detail: string;
}

/** Déplie une distribution pondérée en une liste plate de (raison, sous-raison, détail). */
function flatten(dist: readonly Weight[]): readonly Part[] {
  const out: Part[] = [];
  for (const w of dist) {
    for (let i = 0; i < w.count; i += 1) {
      out.push({ reason: w.reason, sub: w.sub, detail: w.detail ?? "" });
    }
  }
  return out;
}

/**
 * Phase **pertes & terminaisons** : crée des sociétés **résiliées** par zone (barre
 * « Perte » de l'adoption) et enregistre les **terminaisons** avec une distribution
 * **contrastée** — sunburst raison → sous-raison aux ratios nets, et taux de
 * rattrapage variable par catégorie. Idempotent (SIRET + upsert). Chaque résiliée
 * porte une raison pondérée ; les tentatives rattrapées ciblent des comptes actifs.
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
        await record(harness, `term_c_${k}`, company.id, w, k, "confirmed");
      }
    }
  }
  await seedRecovered(harness);
  return created;
}

/** Tentatives **rattrapées** sur des comptes actifs du bastion, distribution pondérée. */
async function seedRecovered(harness: SeedHarness): Promise<void> {
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
  for (let j = 0; j < recovered.length; j += 1) {
    const w = recovered[j];
    const company = active[j % active.length];
    if (w !== undefined && company !== undefined) {
      await record(harness, `term_r_${j}`, company.id, w, j, "recovered");
    }
  }
}

/** Upsert d'une terminaison (idempotent par id). `initiatedBy` alterné client/commercial. */
async function record(
  harness: SeedHarness,
  id: string,
  companyId: string,
  part: Part,
  index: number,
  outcome: "confirmed" | "recovered",
): Promise<void> {
  const data = {
    id,
    companyId,
    reason: part.reason,
    subReason: part.sub,
    detail: part.detail,
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
