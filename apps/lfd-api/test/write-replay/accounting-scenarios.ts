import { TEST_COLLECTION_MIN_BUSINESS_DAYS } from "../../src/lafoliecoffee/accounting/domain/services/collection-test-file.js";
import { businessDaysAfter } from "../../src/lafoliecoffee/accounting/domain/services/target2-calendar.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";
import {
  ENTITIES,
  completeEntity,
  declaredEntity,
  entityDeclaration,
  invoicedWorld,
  mandatedCompany,
  png,
  today,
} from "./seeds.js";

const HTTP = "lafoliecoffee/accounting/http";
const HOUR_MS = 60 * 60 * 1000;

/** La comptabilité : entités, exports bancaires, lots, essais, virements, avis. */
export const ACCOUNTING_SCENARIOS: ScenarioSet = {
  [routeKey(`${HTTP}/admin-legal-entities.controller.ts`, "declare")]: () =>
    Promise.resolve({ sub: STAFF, path: ENTITIES, body: entityDeclaration() }),

  [routeKey(`${HTTP}/admin-legal-entity-documents.controller.ts`, "setLogo")]: async ({ ctx }) => {
    const id = await declaredEntity(ctx);
    return {
      sub: STAFF,
      path: `${ENTITIES}/${id}/logo`,
      files: [
        { field: "file", content: png(256, 256), filename: "logo.png", contentType: "image/png" },
      ],
    };
  },

  [routeKey(`${HTTP}/admin-account-bank-exports.controller.ts`, "export")]: async ({ ctx }) => {
    const entityId = await completeEntity(ctx);
    await mandatedCompany(ctx, entityId);
    return { sub: STAFF, path: `${ENTITIES}/${entityId}/account-exports` };
  },

  [routeKey(`${HTTP}/admin-mandate-bank-exports.controller.ts`, "export")]: async ({ ctx }) => {
    const entityId = await completeEntity(ctx);
    await mandatedCompany(ctx, entityId);
    return { sub: STAFF, path: `${ENTITIES}/${entityId}/mandate-exports`, body: {} };
  },

  [routeKey(`${HTTP}/admin-collection-tests.controller.ts`, "generate")]: async (world) => {
    const entityId = await completeEntity(world.ctx);
    const { companyId } = await mandatedCompany(world.ctx, entityId);
    await world.ctx
      .asSub(STAFF)
      .post("/admin/accounting/own-establishments")
      .send({ companyId })
      .expect(204);
    return {
      sub: STAFF,
      path: "/admin/accounting/collection-tests",
      body: {
        companyId,
        amountCents: 100,
        sequence: "RCUR",
        remittance: null,
        requestedCollectionDay: businessDaysAfter(today(world), TEST_COLLECTION_MIN_BUSINESS_DAYS),
      },
    };
  },

  [routeKey(`${HTTP}/admin-collection-batches.controller.ts`, "constitute")]: async (world) => {
    const { entityId, closesAt } = await invoicedWorld(world);
    world.clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    return {
      sub: STAFF,
      path: "/admin/accounting/collection/batches",
      body: { legalEntityId: entityId },
    };
  },

  [routeKey(`${HTTP}/admin-issued-invoices.controller.ts`, "resendNotice")]: async (world) => {
    const { payerId } = await invoicedWorld(world);
    const invoice = await world.ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: payerId },
    });
    return { sub: STAFF, path: `/admin/accounting/invoices/${invoice.id}/resend-notice` };
  },

  [routeKey(`${HTTP}/admin-bank-transfers.controller.ts`, "record")]: async (world) => {
    const { entityId, payerId } = await invoicedWorld(world, async (entity, payer) => {
      const startsAt = new Date(world.clock.now().getTime() - 40 * 24 * HOUR_MS);
      await world.ctx.prisma.payerCollectionMeans.create({
        data: {
          id: `means_${payer}`,
          legalEntityId: entity,
          payerCompanyId: payer,
          effectiveFrom: startsAt,
          means: "bank_transfer",
          reason: "Le client règle par virement, à sa demande écrite",
          createdAt: startsAt,
          createdByStaffId: STAFF,
        },
      });
    });
    const invoice = await world.ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: payerId },
    });
    return {
      sub: STAFF,
      path: `${ENTITIES}/${entityId}/bank-transfers`,
      body: {
        amountCents: invoice.totalTtcCents,
        receivedOn: today(world),
        reference: invoice.number,
        invoiceIds: [invoice.id],
      },
    };
  },
};
