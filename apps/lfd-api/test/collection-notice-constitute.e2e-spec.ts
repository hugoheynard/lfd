/**
 * E2E de l'avis de prélèvement — **l'envoi à la constitution** (PA2) : à qui,
 * et ce qu'il dit.
 *
 * Découpé de `collection-notices.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-notice-scene.ts`.
 */
import { frozenCollectionDay } from "../src/b2b/accounting/domain/services/collection-calendar.js";
import { daysAgo } from "./e2e-harness.js";
import {
  billingContact,
  closesAt,
  collectingEntity,
  constitute,
  ctx,
  cycle,
  ICS,
  orderOf,
  owner,
  payer,
  sentMails,
  useCollectionNoticeScene,
} from "./collection-notice-scene.js";

useCollectionNoticeScene();

describe("l'avis de prélèvement, à la constitution (PA2)", () => {
  it("part au contact de facturation, avec le montant de l'arrêté, l'échéance du lot et la RUM", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await billingContact(port.id, "compta@port.test");
    await owner(port.id, "patron@port.test");
    await orderOf(port.id);

    const batchId = await constitute(entity);

    const statement = await ctx.prisma.billingStatement.findFirstOrThrow({ where: { batchId } });
    const notice = await ctx.prisma.collectionNotice.findFirstOrThrow({ where: { batchId } });
    const day = frozenCollectionDay(closesAt, new Date(daysAgo(0)), 14, null).day;
    expect(notice).toMatchObject({
      kind: "notice",
      status: "sent",
      recipientEmail: "compta@port.test",
      recipientSource: "billing_contact",
      amountCents: statement.totalTtcCents,
      mandateReference: port.rum,
      statementId: statement.id,
      creditorIcs: ICS,
    });
    expect(notice.collectionDay.toISOString().slice(0, 10)).toBe(day);
    const outbox = await ctx.prisma.outboxMessage.findUniqueOrThrow({
      where: { key: `collection.notice_to_send:${notice.id}` },
    });
    expect(outbox.type).toBe("collection.notice_to_send");
    expect(sentMails).toHaveLength(1);
    expect(sentMails[0]).toMatchObject({
      to: "compta@port.test",
      template: "customer.collection-notice",
      idempotencyKey: `collection.notice:${notice.id}`,
      data: {
        kind: "notice",
        creditorIdentifier: ICS,
        mandateReference: port.rum,
        statementReference: statement.id,
      },
    });
    const [batch] = (await cycle(entity)).batches;
    expect(batch?.requestedCollectionDay).toBe(day);
    expect(batch?.lines[0]?.notice).toMatchObject({
      kind: "notice",
      status: "sent",
      recipientEmail: "compta@port.test",
    });
  });

  it("sans contact de facturation, au détenteur du compte", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await owner(port.id, "patron@port.test");
    await orderOf(port.id);

    await constitute(entity);

    expect(sentMails.map((mail) => mail.to)).toEqual(["patron@port.test"]);
  });
});
