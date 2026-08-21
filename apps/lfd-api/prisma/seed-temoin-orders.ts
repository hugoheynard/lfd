import "dotenv/config";

import type { AdminPlaceOrderPayload, PlaceOrderPayload } from "@lfd/contracts";

import { PlaceOrderForCustomerCommand } from "../src/b2b/orders/application/commands/place-order-for-customer.command.js";
import { PlaceOrderCommand } from "../src/b2b/orders/application/commands/place-order.command.js";
import { PaymentStatus } from "../src/platform/database/client/client.js";
import { bootstrapHarness, customer, type SeedHarness } from "./seed-growth/harness.js";

/**
 * Seed d'**historique de commandes** pour UNE société témoin.
 *
 * À quoi il sert : l'écran de saisie du back-office ouvre sur « ses habitudes ».
 * Devant une société sans passé, cette colonne est vide et l'écran ment sur ce
 * qu'il sait faire. Ce seed lui donne douze mois de vie plausible.
 *
 * ```bash
 * pnpm --filter lfd-api seed:temoin
 * SEED_COMPANY_REF=C-XXXXXX pnpm --filter lfd-api seed:temoin
 * ```
 *
 * **Additif et idempotent** : une échéance déjà servie (même société, même jour)
 * est sautée. Rejouable à volonté ; il n'efface rien.
 *
 * **Deux taux de règlement**, parce que l'écran de facturation les oppose :
 * deux tiers des échéances partent au compte (`not_required`, à facturer en fin
 * de mois), un tiers est réglé à la commande (`paid`). Un compte qui n'aurait
 * que l'un des deux ne dirait rien de la mise en page.
 *
 * Les commandes passent par les **vrais handlers** : prix ré-résolus au
 * catalogue, TVA calculée par l'agrégat, jeton de retrait émis. Seule la **date
 * de création** est réécrite après coup — `orders.created_at` a un défaut SQL
 * que ni le `Clock` ni le contexte de requête ne peuvent devancer. C'est la
 * seule entorse, et elle ne touche qu'une colonne d'horodatage.
 */
const COMPANY_REF = process.env["SEED_COMPANY_REF"] ?? "C-VUNM9M";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Le rythme d'une boulangerie cliente : une commande tous les ~15 jours sur
 * douze mois. Assez pour que « les plus repris » veuille dire quelque chose, pas
 * au point de noyer la colonne de gauche.
 */
const OCCURRENCES = 24;
const EVERY_DAYS = 15;

/**
 * Ce que ce client reprend **presque toujours** — le cœur de ses habitudes, et
 * ce que l'écran doit proposer en premier. Les quantités varient d'une échéance
 * à l'autre : une moyenne calculée sur des quantités identiques ne prouverait
 * rien.
 */
const CORE: readonly { readonly sku: string; readonly base: number }[] = [
  { sku: "VIE-001", base: 40 }, // Croissant
  { sku: "VIE-002", base: 30 }, // Pain au chocolat
  { sku: "PAI-001", base: 25 }, // Baguette tradition
  { sku: "VIE-009", base: 12 }, // Pain au lait
];

/** Pris de temps en temps — la queue de distribution, celle qui doit passer après. */
const OCCASIONAL: readonly { readonly sku: string; readonly every: number }[] = [
  { sku: "PAT-005", every: 3 }, // Éclair chocolat
  { sku: "SAL-019", every: 4 }, // Fougasse provençale
  { sku: "PAI-013", every: 5 }, // Pain complet
];

/**
 * Un produit **abandonné** en cours d'année : présent sur les six premières
 * échéances, plus jamais ensuite. Il exerce le cas « commandé autrefois » — la
 * liste doit continuer de le montrer, et l'écran de ne plus le proposer si le
 * catalogue le retire un jour.
 */
const ABANDONED = { sku: "PAT-002", untilOccurrence: 6 };

/** Un produit **récent** : rien pendant neuf mois, puis à chaque fois. */
const NEWCOMER = { sku: "CHO-003", fromOccurrence: 18 };

async function main(): Promise<void> {
  const harness = await bootstrapHarness();
  try {
    const company = await harness.prisma.company.findFirst({
      where: { reference: COMPANY_REF },
      select: { id: true, reference: true, raisonSociale: true, enseigne: true },
    });
    if (company === null) {
      throw new Error(`Société « ${COMPANY_REF} » introuvable dans la base de développement.`);
    }
    const buyer = await harness.prisma.membership.findFirst({
      where: { companyId: company.id },
      select: { userId: true },
    });
    if (buyer === null) {
      throw new Error(
        `La société « ${COMPANY_REF} » n'a aucun membre : rien à qui porter les commandes.`,
      );
    }
    const staffId = await firstActiveStaffId(harness);

    const anchor = startOfDay(new Date());
    let created = 0;
    let skipped = 0;
    for (let occurrence = 0; occurrence < OCCURRENCES; occurrence += 1) {
      // `startOfDay` REPOSÉ après la soustraction : retrancher des multiples de
      // 24 h traverse un changement d'heure, et la date obtenue glisse alors
      // d'une heure. C'est ce glissement qui faisait rater le garde
      // d'idempotence — 10 doublons au deuxième passage, constatés.
      const at = startOfDay(
        new Date(anchor.getTime() - (OCCURRENCES - 1 - occurrence) * EVERY_DAYS * DAY_MS),
      );
      if (await hasOrderOn(harness, company.id, at)) {
        skipped += 1;
        continue;
      }
      // Une échéance sur huit est saisie par l'équipe — de quoi voir la pastille
      // « Saisie par l'équipe » dans la liste, et vérifier que la commande reste
      // bien celle du client.
      const byStaff = staffId !== null && occurrence % 8 === 3;
      await place(harness, {
        companyId: company.id,
        buyerUserId: buyer.userId,
        lines: linesFor(occurrence),
        at,
        staffId: byStaff ? staffId : null,
        // Une échéance sur trois est réglée **à la commande** plutôt que portée
        // au compte : sans elles, l'écran de facturation n'aurait qu'une colonne
        // remplie, et on ne verrait pas si les deux s'alignent.
        paidAtOrder: occurrence % 3 === 1,
      });
      created += 1;
    }

    const label = company.enseigne || company.raisonSociale;
    console.log(
      `✔ ${label} (${company.reference}) — ${created} commande(s) créée(s), ${skipped} déjà en place.`,
    );
  } finally {
    await harness.close();
  }
}

/** Les lignes d'une échéance : le cœur qui oscille, plus ce qui va et vient. */
function linesFor(occurrence: number): { readonly sku: string; readonly quantity: number }[] {
  const lines = CORE.map((item) => ({
    sku: item.sku,
    // ±25 % autour de la base, déterministe : le même seed donne le même corpus,
    // et deux exécutions ne se contredisent pas.
    quantity: Math.max(1, Math.round(item.base * (1 + wobble(occurrence, item.sku) * 0.25))),
  }));
  for (const item of OCCASIONAL) {
    if (occurrence % item.every === 0) {
      lines.push({ sku: item.sku, quantity: 4 + (occurrence % 5) });
    }
  }
  if (occurrence < ABANDONED.untilOccurrence) {
    lines.push({ sku: ABANDONED.sku, quantity: 6 });
  }
  if (occurrence >= NEWCOMER.fromOccurrence) {
    lines.push({ sku: NEWCOMER.sku, quantity: 3 });
  }
  return lines;
}

/** Oscillation déterministe dans [-1, 1], dérivée de l'échéance et du SKU. */
function wobble(occurrence: number, sku: string): number {
  const seed = occurrence * 31 + sku.charCodeAt(sku.length - 1);
  return ((seed % 9) - 4) / 4;
}

/** Passe une commande, puis recale sa date de création. */
async function place(
  harness: SeedHarness,
  input: {
    readonly companyId: string;
    readonly buyerUserId: string;
    readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
    readonly at: Date;
    readonly staffId: string | null;
    readonly paidAtOrder: boolean;
  },
): Promise<void> {
  const content = {
    fulfillmentMethod: "pickup" as const,
    deliveryAddress: null,
    pickupAddressId: null,
    // Retrait le lendemain de la commande — la règle du parcours réel.
    requestedDeliveryDate: isoDay(new Date(input.at.getTime() + DAY_MS)),
    note: "",
    lines: [...input.lines],
  };

  const placed = await harness.runAt(input.at, customer(input.buyerUserId), async () => {
    if (input.staffId === null) {
      const payload: PlaceOrderPayload = { companyId: input.companyId, ...content };
      return harness.commands.execute<PlaceOrderCommand, { id: string }>(
        new PlaceOrderCommand(input.buyerUserId, payload),
      );
    }
    const payload: AdminPlaceOrderPayload = {
      companyId: input.companyId,
      buyerUserId: input.buyerUserId,
      settlement: "account",
      ...content,
    };
    return harness.commands.execute<PlaceOrderForCustomerCommand, { id: string }>(
      new PlaceOrderForCustomerCommand(input.staffId, payload),
    );
  });

  // Les deux seules écritures directes du seed.
  //
  // `created_at` a un défaut SQL : ni le `Clock` ni le contexte daté ne le
  // devancent, et c'est cette colonne que lisent l'historique et l'agrégation
  // « déjà commandés ».
  //
  // `payment_status` figure un encaissement par carte, que ce seed ne peut pas
  // simuler autrement : la vraie bascule vient du webhook Stripe, et il n'y a
  // pas de Stripe en développement.
  await harness.prisma.order.update({
    where: { id: placed.id },
    data: {
      createdAt: input.at,
      ...(input.paidAtOrder ? { paymentStatus: PaymentStatus.paid } : {}),
    },
  });
}

/**
 * Une commande existe-t-elle déjà ce jour-là pour cette société ?
 *
 * La fenêtre est la **journée civile entière**, pas une plage calée sur l'heure
 * de pose : c'est ce qui rend le garde insensible aux changements d'heure.
 */
async function hasOrderOn(harness: SeedHarness, companyId: string, at: Date): Promise<boolean> {
  const from = new Date(at);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  const count = await harness.prisma.order.count({
    where: { companyId, createdAt: { gte: from, lt: to } },
  });
  return count > 0;
}

/**
 * Un membre de l'équipe **actif**, pour signer quelques commandes. `null` si
 * l'annuaire est vide : on préfère un corpus sans saisie staff à un corpus qui
 * invente un auteur.
 */
async function firstActiveStaffId(harness: SeedHarness): Promise<string | null> {
  const staff = await harness.prisma.staffUser.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return staff?.id ?? null;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(9, 0, 0, 0);
  return copy;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

await main();
