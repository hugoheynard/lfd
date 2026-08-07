import "dotenv/config";

import type { CaptureLeadPayload, LeadStatus } from "@lfd/contracts";

import { CaptureLeadCommand } from "../src/growth/application/commands/capture-lead.command.js";
import { ChangeLeadStatusCommand } from "../src/growth/application/commands/change-lead-status.command.js";
import { RecomputeLeadScoresCommand } from "../src/growth/application/commands/recompute-lead-scores.command.js";
import type { VerifiedToken } from "../src/infra/auth/principal.js";
import { bootstrapHarness, SEED_STAFF, SYSTEM, type SeedHarness } from "./seed-growth/harness.js";
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
/** Un tiers des personnes environ deviennent aussi une cible de démarchage cold. */
const LEADS = Math.max(6, Math.floor(USERS / 3));

const DAY_MS = 24 * 60 * 60 * 1000;
const ANCHOR = new Date();

/** Étape de pipeline déterministe pour le lead d'index `i` (réparti). */
const LEAD_STAGES: readonly LeadStatus[] = ["new", "contacted", "qualified", "negotiating", "lost"];

async function main(): Promise<void> {
  const harness = await bootstrapHarness();
  try {
    const users = await seedUsers(harness);
    const orders = await seedOrders(harness, USERS, ANCHOR);
    const leads = await seedLeads(harness);
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
      `\n✔ seed growth : ${users} personnes, ${orders} commandes (prospects hot), ${leads} leads cold, ${scored} leads scorés (cockpit).`,
    );
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
    const registeredAt = new Date(ANCHOR.getTime() - ((i * 2) % 90) * DAY_MS);
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
    const capturedAt = new Date(ANCHOR.getTime() - ((i * 3) % 60) * DAY_MS);
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
