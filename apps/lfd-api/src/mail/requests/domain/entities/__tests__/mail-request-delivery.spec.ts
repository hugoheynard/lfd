import type { MailDeliveryReport } from "../../value-objects/mail-delivery.js";
import { MailRequest, type MailRequestDraft } from "../mail-request.js";

// Les instants ne sont comparés qu'entre eux : aucune horloge n'est lue.
const REQUESTED_AT = new Date(0);
const SENT_AT = new Date(60_000);

const DRAFT: MailRequestDraft = {
  id: "mail_1",
  template: "customer.order-ready",
  brand: "lfc",
  recipient: "  Client.Pro@Example.TEST ",
  locale: "fr",
  idempotencyKey: "order.ready:o1",
  requestedAt: REQUESTED_AT,
};

function sent(): MailRequest {
  const request = MailRequest.request(DRAFT);
  request.markSent("re_1", SENT_AT);
  return request;
}

const report = (
  delivery: MailDeliveryReport["delivery"],
  seconds: number,
  kind: string | null = null,
): MailDeliveryReport => ({ delivery, kind, at: new Date(SENT_AT.getTime() + seconds * 1000) });

describe("MailRequest — la clé de l'adresse (décision 9)", () => {
  it("est écrite par l'agrégat, en minuscules, à la création", () => {
    expect(MailRequest.request(DRAFT).snapshot()).toMatchObject({
      recipient: "Client.Pro@Example.TEST",
      recipientKey: "client.pro@example.test",
    });
  });

  it("naît sans retour du fournisseur", () => {
    expect(MailRequest.request(DRAFT).snapshot()).toMatchObject({
      delivery: null,
      deliveryAt: null,
      deliveryKind: null,
    });
  });
});

describe("MailRequest.recordDelivery — vers le haut seulement (décision 3)", () => {
  it("applique un premier retour, son instant et son genre", () => {
    const request = sent();

    expect(request.recordDelivery(report("bounced", 5, "Permanent/General"))).toBe(true);

    expect(request.snapshot()).toMatchObject({
      status: "sent",
      delivery: "bounced",
      deliveryAt: report("bounced", 5).at,
      deliveryKind: "Permanent/General",
    });
  });

  it.each([
    ["delayed", "delivered"],
    ["delivered", "complained"],
    ["complained", "bounced"],
    ["delayed", "bounced"],
  ] as const)("relève %s → %s", (first, then) => {
    const request = sent();
    request.recordDelivery(report(first, 1));

    expect(request.recordDelivery(report(then, 2))).toBe(true);
    expect(request.snapshot().delivery).toBe(then);
  });

  it("un `delivered` arrivé après un `bounced` ne change rien", () => {
    const request = sent();
    request.recordDelivery(report("bounced", 1, "Permanent"));

    expect(request.recordDelivery(report("delivered", 9))).toBe(false);
    expect(request.snapshot()).toMatchObject({
      delivery: "bounced",
      deliveryKind: "Permanent",
      deliveryAt: report("bounced", 1).at,
    });
  });

  it("le même retour rejoué ne change rien", () => {
    const request = sent();
    request.recordDelivery(report("delivered", 1));

    expect(request.recordDelivery(report("delivered", 3))).toBe(false);
    expect(request.snapshot().deliveryAt).toEqual(report("delivered", 1).at);
  });

  it("ne touche pas au cycle de la demande : une rebondie reste acceptée et close", () => {
    const request = sent();
    request.recordDelivery(report("bounced", 1));

    expect(request.status).toBe("sent");
    expect(request.isSettled()).toBe(true);
  });
});

describe("MailRequest.recordDelivery — l'entrée dans l'échec (plan-sujet-des-e-mails, règle 4)", () => {
  const ORDER = { type: "order", id: "ord_1" } as const;

  function sentFor(subjects: MailRequestDraft["subjects"] = [ORDER]): MailRequest {
    const request = MailRequest.request({ ...DRAFT, subjects });
    request.markSent("re_1", SENT_AT);
    return request;
  }

  it("note l'entrée dans l'échec de rien vers `bounced`, avec ses sujets et sans adresse", () => {
    const request = sentFor();

    request.recordDelivery(report("bounced", 5, "Permanent/General"));

    const failures = request.pullDeliveryFailures();
    expect(failures).toEqual([
      {
        requestId: "mail_1",
        template: "customer.order-ready",
        subjects: [ORDER],
        delivery: "bounced",
        kind: "Permanent/General",
        at: new Date(SENT_AT.getTime() + 5000),
      },
    ]);
    expect(JSON.stringify(failures)).not.toContain("@");
  });

  it.each([
    ["delayed", "complained"],
    ["delivered", "bounced"],
    ["delivered", "complained"],
  ] as const)("note l'entrée de `%s` vers `%s`", (before, after) => {
    const request = sentFor();
    request.recordDelivery(report(before, 1));

    request.recordDelivery(report(after, 2));

    expect(request.pullDeliveryFailures().map((failure) => failure.delivery)).toEqual([after]);
  });

  it("ne note rien de `complained` vers `bounced` : la demande est déjà en échec", () => {
    const request = sentFor();
    request.recordDelivery(report("complained", 1));
    request.pullDeliveryFailures();

    expect(request.recordDelivery(report("bounced", 2))).toBe(true);
    expect(request.pullDeliveryFailures()).toEqual([]);
  });

  it("ne note rien de `bounced` vers `delivered` : l'échelle ne descend pas", () => {
    const request = sentFor();
    request.recordDelivery(report("bounced", 1));
    request.pullDeliveryFailures();

    expect(request.recordDelivery(report("delivered", 2))).toBe(false);
    expect(request.pullDeliveryFailures()).toEqual([]);
  });

  it("ne note rien pour une remise ni un retard", () => {
    const request = sentFor();
    request.recordDelivery(report("delayed", 1));
    request.recordDelivery(report("delivered", 2));

    expect(request.pullDeliveryFailures()).toEqual([]);
  });

  it("ne note rien pour une demande sans sujet : personne à prévenir", () => {
    const request = sentFor([]);

    request.recordDelivery(report("bounced", 1));

    expect(request.pullDeliveryFailures()).toEqual([]);
  });

  it("rend les entrées une fois : une seconde lecture est vide", () => {
    const request = sentFor();
    request.recordDelivery(report("bounced", 1));

    expect(request.pullDeliveryFailures()).toHaveLength(1);
    expect(request.pullDeliveryFailures()).toEqual([]);
  });

  it("une demande relue ne porte aucune entrée en attente", () => {
    const request = sentFor();
    request.recordDelivery(report("bounced", 1));

    expect(MailRequest.rehydrate(request.snapshot()).pullDeliveryFailures()).toEqual([]);
  });
});
