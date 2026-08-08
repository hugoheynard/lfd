import "dotenv/config";

import type { CaptureLeadPayload, LeadStatus } from "@lfd/contracts";

import { CaptureLeadCommand } from "../src/growth/application/commands/capture-lead.command.js";
import { ChangeLeadStatusCommand } from "../src/growth/application/commands/change-lead-status.command.js";
import { RecomputeLeadScoresCommand } from "../src/growth/application/commands/recompute-lead-scores.command.js";
import type { VerifiedToken } from "../src/infra/auth/principal.js";
import { bootstrapHarness, SEED_STAFF, SYSTEM, type SeedHarness } from "./seed-growth/harness.js";
import { seedActivation } from "./seed-growth/phase-activation.js";
import { seedFlagship, seedSatellites } from "./seed-growth/phase-flagship.js";
import { seedLosses } from "./seed-growth/phase-losses.js";
import { seedMarket } from "./seed-growth/phase-market.js";
import { seedOrders } from "./seed-growth/phase-orders.js";
import { persona } from "./seed-growth/personas.js";

/**
 * Seed **growth** — corpus de démo/charge **additif, idempotent, piloté par les
 * VRAIS handlers**. Il n'efface RIEN (ni `dev@lafoliedouce.com`, ni les démarches
 * perso) : tout vit sous le namespace `seed-…@demo.lafoliedouce.fr`, et on ne crée
 * que l'absent. Rejouable à volonté ; l'échelle est réglée par `SEED_USERS`
 * (défaut 40 pour le design, `=500` pour un corpus de test de charge).
 *
 * Slice 1 : provisioning des personnes (⇒ prospects **mid**) + saisie de leads
 * **cold** répartis dans le pipeline. Les commandes/tunnels (orders, activation)
 * viennent aux slices suivantes.
 */
const USERS = clampInt(process.env["SEED_USERS"], 40, 1, 5000);
/**
 * Cohorte de démarchage **cold** aussi grande que les inscrits : l'acquisition est
 * **majoritairement sales-led** (le commercial signe les comptes). La plupart des
 * leads sont **convertis par le staff** (`lead.converted` via=manual → sales-led),
 * ce qui domine le mix face aux déclarations self (product-led) de l'activation.
 */
const LEADS = Math.max(8, USERS * 2);
/** ~la moitié des personnes déclarent une société (entonnoir d'activation). */
const COMPANIES = Math.max(6, Math.floor(USERS / 2));

const DAY_MS = 24 * 60 * 60 * 1000;
const ANCHOR = new Date();

/**
 * Étape cible déterministe par index — **pondérée vers `converted`** (6/10) pour un
 * mix sales-led dominant, avec une minorité perdue (2/10) et en cours (2/10).
 */
const LEAD_STAGES: readonly LeadStatus[] = [
  "converted",
  "converted",
  "lost",
  "converted",
  "converted",
  "converted",
  "negotiating",
  "converted",
  "converted",
  "lost",
];

async function main(): Promise<void> {
  const harness = await bootstrapHarness();
  try {
    const users = await seedUsers(harness);
    const orders = await seedOrders(harness, USERS, ANCHOR);
    const companies = await seedActivation(harness, COMPANIES, ANCHOR);
    const leads = await seedLeads(harness);
    const refreshed = await seedMarket(harness, ANCHOR);
    const flagship = await seedFlagship(harness, ANCHOR);
    const satellites = await seedSatellites(harness, ANCHOR);
    const losses = await seedLosses(harness, ANCHOR);
    // Les abonnés du journal (`@EventsHandler`) sont détachés : on laisse une
    // fenêtre pour qu'ils écrivent avant de résumer.
    await settle(1500);
    // Recalcule le read-model du cockpit (comme le cron) → la queue est peuplée.
    const scored = await harness.runAt(ANCHOR, SEED_STAFF, () =>
      harness.commands.execute<RecomputeLeadScoresCommand, number>(
        new RecomputeLeadScoresCommand(),
      ),
    );
    console.log(
      `\n✔ seed growth : ${users} personnes, ${orders} commandes, ${companies} sociétés (activation), ${leads} leads cold, ${scored} scorés (cockpit).`,
    );
    console.log(
      `  marché ciblé : 3 zones Savoie + 6 NAF ${refreshed ? "(addressable rafraîchi via l'API)" : "(déjà compté / API injoignable → « Redemander » dans Réglages)"}.`,
    );
    console.log(`  flagship Val d'Isère : +${flagship} sociétés activées (viser ~30 % du marché).`);
    console.log(`  satellites Tignes/Bourg : +${satellites} sociétés activées (base pour équilibrer le churn).`);
    console.log(`  pertes : +${losses} sociétés résiliées (barre « Perte » par territoire).`);
    await summarize(harness);
    console.log("  (additif + idempotent — rejouable ; rien d'existant n'a été effacé)");
  } finally {
    await harness.close();
  }
}

/** Résume l'état du journal + des leads (preuve que la chaîne réelle a écrit). */
async function summarize(harness: SeedHarness): Promise<void> {
  const journal = await harness.prisma.activityEvent.groupBy({ by: ["type"], _count: true });
  const leads = await harness.prisma.lead.groupBy({ by: ["status"], _count: true });
  const line = (rows: { _count: number }[], key: (r: { _count: number }) => string): string =>
    rows.map(key).join("  ");
  console.log(
    "  journal :",
    line(journal, (r) => `${(r as { type: string })["type"]}=${r._count}`),
  );
  console.log(
    "  leads   :",
    line(leads, (r) => `${(r as { status: string })["status"]}=${r._count}`),
  );
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Provisionne `USERS` personnes via le VRAI resolver (émet `user.registered`). */
async function seedUsers(harness: SeedHarness): Promise<number> {
  let created = 0;
  for (let i = 0; i < USERS; i += 1) {
    const who = persona(i);
    const token: VerifiedToken = { subject: who.authSub, scopes: [], email: who.email };
    const registeredAt = new Date(ANCHOR.getTime() - ((i * 7) % 182) * DAY_MS);
    await harness.runAt(registeredAt, SYSTEM, () => harness.resolver.resolve(token));
    created += 1;
  }
  return created;
}

/** Saisit `LEADS` leads cold (index décalé) et les répartit dans le pipeline. */
async function seedLeads(harness: SeedHarness): Promise<number> {
  let created = 0;
  for (let i = 0; i < LEADS; i += 1) {
    const who = persona(10_000 + i);
    const existing = await harness.prisma.lead.findFirst({ where: { email: who.email } });
    if (existing !== null) {
      continue; // idempotent : déjà semé.
    }
    const capturedAt = new Date(ANCHOR.getTime() - ((i * 13) % 168) * DAY_MS);
    const payload: CaptureLeadPayload = {
      businessName: who.businessName,
      contactName: who.contactName,
      email: who.email,
      phone: who.phone,
      siret: "",
      notes: "Rencontré au salon de la restauration.",
    };
    const leadId = await harness.runAt(capturedAt, SEED_STAFF, () =>
      harness.commands.execute<CaptureLeadCommand, string>(new CaptureLeadCommand(payload)),
    );
    await advanceLead(harness, leadId, i, capturedAt);
    created += 1;
  }
  return created;
}

/** Fait avancer un lead jusqu'à l'étape cible (transitions successives, datées). */
async function advanceLead(
  harness: SeedHarness,
  leadId: string,
  i: number,
  from: Date,
): Promise<void> {
  const target = LEAD_STAGES[i % LEAD_STAGES.length];
  const path = stagesUpTo(target);
  let when = from;
  for (const status of path) {
    when = new Date(when.getTime() + 2 * DAY_MS);
    await harness.runAt(when, SEED_STAFF, () =>
      harness.commands.execute<ChangeLeadStatusCommand, void>(
        new ChangeLeadStatusCommand(leadId, status),
      ),
    );
  }
}

/** Chemin de transitions pour atteindre `target` depuis `new` (sans `new`). */
function stagesUpTo(target: LeadStatus): Exclude<LeadStatus, "new">[] {
  if (target === "new") {
    return [];
  }
  if (target === "lost") {
    return ["contacted", "lost"];
  }
  if (target === "converted") {
    // Signé après un cycle complet de démarchage → `lead.converted` (sales-led).
    return ["contacted", "qualified", "negotiating", "converted"];
  }
  const order: Exclude<LeadStatus, "new" | "converted" | "lost">[] = [
    "contacted",
    "qualified",
    "negotiating",
  ];
  const cut = order.indexOf(target as "contacted" | "qualified" | "negotiating");
  return order.slice(0, cut + 1);
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

main().catch((error: unknown) => {
  console.error("seed growth: échec", error);
  process.exitCode = 1;
});
