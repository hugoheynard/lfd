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
 * Phase **flagship** : peuple Val d'Isère jusqu'à ~30 % de pénétration, pour le
 * récit « bastion conquis ». Vise `round(30 % × addressable_73150)` sociétés
 * **activées**, adresses forcées sur Val d'Isère, dates d'activation **étalées sur
 * ~24 semaines** → la part de marché monte progressivement (courbe de la §2.1 qui
 * grimpe). Idempotent (SIRET + comptage de l'existant). À lancer APRÈS le refresh
 * marché (addressable connu) ; no-op si l'addressable est à 0.
 */
export async function seedFlagship(harness: SeedHarness, anchor: Date): Promise<number> {
  const store = harness.module.get(MarketConfigStore, { strict: false });
  const zone = (await store.load()).zones.find((z) => z.codePostal === FLAGSHIP_CP);
  if (zone === undefined || zone.addressable === 0) {
    return 0;
  }
  const target = Math.round(TARGET_SHARE * zone.addressable);
  const existing = await harness.prisma.company.count({
    where: { status: "active", addresses: { some: { codePostal: FLAGSHIP_CP } } },
  });
  let created = 0;
  for (let k = 0; created < target - existing && k < target * 2; k += 1) {
    const declaredAt = new Date(anchor.getTime() - ((k * 7) % 168) * DAY_MS);
    if (await seedCompany(harness, valdisereWho(k), validSiret(FLAGSHIP_BASE + k), 5, declaredAt)) {
      created += 1;
    }
  }
  return created;
}

/** Persona déterministe forcé sur Val d'Isère (nom de lieu conservé, station réécrite). */
function valdisereWho(k: number): ReturnType<typeof persona> {
  const base = persona(FLAGSHIP_BASE + k);
  const venue = base.businessName.split(" · ")[0];
  return {
    ...base,
    businessName: `${venue} · ${FLAGSHIP_VILLE}`,
    stationLabel: FLAGSHIP_VILLE,
    codePostal: FLAGSHIP_CP,
    ville: FLAGSHIP_VILLE,
  };
}
