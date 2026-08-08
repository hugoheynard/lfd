import { MarketConfigStore } from "../../src/growth/domain/ports/market-config.store.js";
import { seedCompany, validSiret } from "./phase-activation.js";
import { type SeedHarness } from "./harness.js";
import { persona } from "./personas.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Val d'Isère = la station « bastion » où l'on vise une adoption forte. */
const FLAGSHIP_CP = "73150";
const FLAGSHIP_VILLE = "Val d'Isère";
/** Part de marché visée sur le bastion (dénominateur = addressable réel de la zone). */
const TARGET_SHARE = 0.3;
/** Espace d'index dédié au flagship (jamais en collision avec les autres personas). */
const FLAGSHIP_BASE = 30_000;

/**
 * Zones **secondaires** : une base active crédible pour équilibrer la carte adoption
 * (sinon elles n'ont que des résiliées → churn 100 % sur ~5 sociétés, du bruit). Comptes
 * fixes modestes, index dédiés (hors flagship 30k et pertes 40k).
 */
const SATELLITES: ReadonlyArray<{ cp: string; ville: string; target: number; base: number }> = [
  { cp: "73320", ville: "Tignes", target: 22, base: 50_000 },
  { cp: "73700", ville: "Bourg-Saint-Maurice", target: 20, base: 51_000 },
];

/**
 * Phase **flagship** : peuple Val d'Isère jusqu'à ~30 % de pénétration, pour le
 * récit « bastion conquis ». Vise `round(30 % × addressable_73150)` sociétés
 * **activées**, adresses forcées sur Val d'Isère, dates d'activation **étalées sur
 * ~24 semaines** → la part de marché monte progressivement. Idempotent (SIRET +
 * comptage de l'existant). À lancer APRÈS le refresh marché ; no-op si addressable = 0.
 */
export async function seedFlagship(harness: SeedHarness, anchor: Date): Promise<number> {
  const store = harness.module.get(MarketConfigStore, { strict: false });
  const zone = (await store.load()).zones.find((z) => z.codePostal === FLAGSHIP_CP);
  if (zone === undefined || zone.addressable === 0) {
    return 0;
  }
  const target = Math.round(TARGET_SHARE * zone.addressable);
  return seedActiveBase(harness, anchor, FLAGSHIP_CP, FLAGSHIP_VILLE, target, FLAGSHIP_BASE);
}

/**
 * Phase **satellites** : une base active modeste sur les zones secondaires (Tignes,
 * Bourg-Saint-Maurice) pour que l'adoption s'y voie et que le churn retombe à un
 * niveau sain (au lieu d'un ~100 % sur 5 sociétés). Idempotent.
 */
export async function seedSatellites(harness: SeedHarness, anchor: Date): Promise<number> {
  let created = 0;
  for (const s of SATELLITES) {
    created += await seedActiveBase(harness, anchor, s.cp, s.ville, s.target, s.base);
  }
  return created;
}

/** Peuple une zone de `target` sociétés ACTIVÉES (adresses forcées, dates étalées). Idempotent. */
async function seedActiveBase(
  harness: SeedHarness,
  anchor: Date,
  cp: string,
  ville: string,
  target: number,
  base: number,
): Promise<number> {
  const existing = await harness.prisma.company.count({
    where: { status: "active", addresses: { some: { codePostal: cp } } },
  });
  let created = 0;
  for (let k = 0; created < target - existing && k < target * 2; k += 1) {
    const declaredAt = new Date(anchor.getTime() - ((k * 7) % 168) * DAY_MS);
    if (await seedCompany(harness, zoneWho(base + k, cp, ville), validSiret(base + k), 5, declaredAt)) {
      created += 1;
    }
  }
  return created;
}

/** Persona déterministe forcé sur une zone (nom de lieu conservé, station réécrite). */
function zoneWho(index: number, cp: string, ville: string): ReturnType<typeof persona> {
  const base = persona(index);
  const venue = base.businessName.split(" · ")[0];
  return { ...base, businessName: `${venue} · ${ville}`, stationLabel: ville, codePostal: cp, ville };
}
