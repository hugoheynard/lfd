/**
 * E2E — **les échéances en lignes**, par leur dépôt (`OccurrenceRepository`,
 * plan `plan-bloc-recurrent.md`, § 5) contre le vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve : l'écriture sous condition d'état — une
 * échéance passée est close, deux écrivains partis du même état n'écrivent
 * qu'une fois —, le refus qui se réécrit puis se passe, et la lecture des
 * dues par l'index `occurrence_due_idx` : un panier actif, un jour de
 * passation atteint, un état dû.
 */
import { BasketRepository } from "../src/recurring/basket/domain/ports/basket.repository.js";
import { IsoDate } from "../src/recurring/basket/domain/value-objects/iso-date.js";
import { OccurrenceRepository } from "../src/recurring/occurrence/domain/ports/occurrence.repository.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { openBasket, publishSalesTerms } from "./recurring-scene.js";

const OWNER = "auth0|occurrences-owner";
/** La première échéance : dans deux jours, donc déjà à passer (sept jours d'avance). */
const FIRST = serviceDay(2);
const LATER = new Date();

let ctx: E2eContext;
let occurrences: OccurrenceRepository;
let companyId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
  occurrences = ctx.app.get(OccurrenceRepository);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await publishSalesTerms(ctx);
  companyId = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  await attachTo(ctx.prisma, owner.id, companyId, CustomerRole.owner);
});

async function first(basketId: string) {
  const occurrence = await occurrences.load(basketId, IsoDate.fromString(FIRST));
  if (occurrence === null) {
    throw new TypeError(`l'échéance du ${FIRST} manque à la création à l'avance`);
  }
  return occurrence;
}

describe("l'écriture sous condition d'état", () => {
  it("une échéance passée est close : une seconde écriture partie de l'état d'avant n'écrit rien", async () => {
    const id = await openBasket(ctx, OWNER, companyId);
    const a = await first(id);
    const b = await first(id);

    a.place("ord_a", LATER);
    expect(await occurrences.save(a)).toBe(true);
    b.refuse("buyer_left", "Le client a quitté la société.", false, LATER);
    expect(await occurrences.save(b)).toBe(false);

    expect(
      await ctx.prisma.occurrence.findFirstOrThrow({ where: { basketId: id, state: "placed" } }),
    ).toMatchObject({ orderId: "ord_a", cause: null });
  });

  it("deux écrivains concurrents partis du même état : un seul écrit", async () => {
    const id = await openBasket(ctx, OWNER, companyId);
    const [a, b] = [await first(id), await first(id)];
    a.place("ord_a", LATER);
    b.place("ord_b", LATER);

    const written = await Promise.all([occurrences.save(a), occurrences.save(b)]);

    expect(written.filter(Boolean)).toHaveLength(1);
    expect(await ctx.prisma.occurrence.count({ where: { basketId: id, state: "placed" } })).toBe(1);
  });

  it("un refus se réécrit sur sa ligne, puis l'échéance se passe et sa cause s'efface", async () => {
    const id = await openBasket(ctx, OWNER, companyId);
    const refused = await first(id);
    refused.refuse("no_settlement", "Aucun moyen de règlement.", false, LATER);
    expect(await occurrences.save(refused)).toBe(true);

    const again = await first(id);
    expect(again.state).toBe("refused");
    expect(again.refuse("no_settlement", "Même cause.", false, LATER)).toBe(false);
    expect(await occurrences.save(again)).toBe(true);

    const placed = await first(id);
    placed.place("ord_1", LATER);
    expect(await occurrences.save(placed)).toBe(true);
    expect(
      await ctx.prisma.occurrence.findFirstOrThrow({ where: { basketId: id, state: "placed" } }),
    ).toMatchObject({ cause: null, reason: null, orderId: "ord_1" });
  });
});

describe("les échéances dues", () => {
  it("rend celles d'un panier actif dont le jour de passation est atteint, pas les autres", async () => {
    const id = await openBasket(ctx, OWNER, companyId);
    const today = IsoDate.fromString(serviceDay(0));

    const due = await occurrences.due(today, 50);
    expect(due.map(({ occurrence }) => occurrence.serviceDay.toString())).toEqual([FIRST]);
    expect(due[0]?.basket.id).toBe(id);

    await ctx.prisma.basket.update({ where: { id }, data: { status: "paused" } });
    expect(await occurrences.due(today, 50)).toEqual([]);
  });

  it("une échéance sautée n'est pas due ; rétablie, elle le redevient", async () => {
    const id = await openBasket(ctx, OWNER, companyId);
    const today = IsoDate.fromString(serviceDay(0));
    const skipped = await first(id);
    skipped.skip("", LATER);
    await occurrences.save(skipped);

    expect(await occurrences.due(today, 50)).toEqual([]);

    const restored = await first(id);
    restored.override(null, "", LATER);
    await occurrences.save(restored);
    expect(await occurrences.due(today, 50)).toHaveLength(1);
  });
});

describe("les CGV annoncées, relues", () => {
  it("une version annoncée s'écrit avec sa date d'effet et se relit ; le panier l'applique à partir d'elle", async () => {
    const baskets = ctx.app.get(BasketRepository);
    const owner = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: OWNER } });
    const id = await openBasket(ctx, OWNER, companyId);
    const sentOn = IsoDate.fromString(serviceDay(0));
    const basket = await baskets.load(id, owner.id);
    if (basket === null) {
      throw new TypeError("le panier ouvert ne se relit pas");
    }

    expect(basket.announceSalesTerms({ revision: 2, fileId: null }, sentOn)).toBe(true);
    await baskets.save(basket, LATER);

    const row = await ctx.prisma.basket.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ salesTermsRevision: 1, salesTermsNextRevision: 2 });
    expect(row.salesTermsEffectiveOn?.toISOString().slice(0, 10)).toBe(serviceDay(30));
    const reread = await baskets.load(id, owner.id);
    expect(reread?.salesTermsOn(IsoDate.fromString(serviceDay(29))).revision).toBe(1);
    expect(reread?.salesTermsOn(IsoDate.fromString(serviceDay(30))).revision).toBe(2);
  });
});
