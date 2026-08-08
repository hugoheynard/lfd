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

/**
 * Phase **pertes** : crée quelques sociétés **résiliées** (`terminated`) par zone,
 * pour alimenter la barre « Perte » de l'adoption par territoire. Chaque société est
 * créée par le chemin réel (activée) puis marquée résiliée en fixture (fin de
 * relation ; pas de commande dédiée dans le seed). Idempotent par SIRET.
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
    }
  }
  return created;
}

/** Persona déterministe forcé sur une zone (nom conservé, station réécrite). */
function zoneWho(k: number, codePostal: string, ville: string): ReturnType<typeof persona> {
  const base = persona(LOSS_BASE + k);
  const venue = base.businessName.split(" · ")[0];
  return { ...base, businessName: `${venue} · ${ville}`, stationLabel: ville, codePostal, ville };
}
