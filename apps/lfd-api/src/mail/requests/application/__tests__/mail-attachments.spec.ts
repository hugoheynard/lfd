import { ORDER_CASES } from "../../../templates/__tests__/rendering-golden/order-cases.js";
import type { DeferredMailDemand } from "../../../channels/requests/mail.js";
import {
  MailAttachmentMissingError,
  MailRequestOutsideUnitOfWorkError,
} from "../../domain/errors/mail-request.errors.js";
import { mailScene } from "./mail-doubles.js";

/*
 * S2a — la pièce jointe par RÉFÉRENCE (plan C2) : la demande porte la place
 * du PDF au stockage, jamais ses octets ; le bloc le relit à l'envoi.
 */

const KEY = "orders/o-1/bon-de-commande-r0-d2.pdf";
const PDF = Buffer.from("%PDF-1.7 bon de commande");

/** Une feuille des empreintes de rendu : le bloc la transporte telle quelle. */
function sheetOfTheGoldens() {
  const placed = Object.values(ORDER_CASES["customer.order-placed"])[0];
  if (placed === undefined) {
    throw new TypeError("les empreintes de rendu n'ont plus de cas « order-placed »");
  }
  return placed.sheet;
}

const PLACED: DeferredMailDemand<"customer.order-placed"> = {
  template: "customer.order-placed",
  to: "client@example.test",
  data: {
    sheet: sheetOfTheGoldens(),
    handoverToken: null,
    orderUrl: "",
    handoverUrl: "",
    document: {
      fileName: "confirmation-de-commande-ORD-1.pdf",
      pdfStored: { store: "customer-documents", key: KEY },
    },
    locale: "fr",
  },
  idempotencyKey: "order.placed:o-1",
};

type Scene = ReturnType<typeof mailScene>;

async function requestedAndDelivered(): Promise<Scene> {
  const scene = mailScene();
  scene.probe.open = true;
  await scene.port.send(PLACED);
  const fact = scene.facts.facts.at(-1);
  if (fact === undefined) {
    throw new TypeError("aucun fait à livrer");
  }
  await scene.subscriber.handle({ eventId: "outbox_1", type: fact.type, payload: fact.payload });
  return scene;
}

describe("request — rend l'identifiant de la demande", () => {
  it("la demande neuve, puis la même pour une clé déjà connue", async () => {
    const scene = mailScene();
    scene.probe.open = true;

    const first = await scene.port.send(PLACED);
    const again = await scene.port.send(PLACED);

    expect(first.requestId).toBe(scene.requests.rows.get(PLACED.idempotencyKey)?.id);
    expect(again.requestId).toBe(first.requestId);
  });

  it("hors d'une unité de travail, refuse toujours avant d'écrire", async () => {
    await expect(mailScene().port.send(PLACED)).rejects.toThrow(MailRequestOutsideUnitOfWorkError);
  });
});

describe("la pièce jointe par référence", () => {
  it("le fait de la boîte d'envoi ne porte que la référence, jamais les octets", async () => {
    const scene = mailScene();
    scene.probe.open = true;

    await scene.port.send(PLACED);

    const payload = JSON.stringify(scene.facts.facts[0]?.payload);
    expect(payload).toContain(KEY);
    expect(payload).not.toContain("pdfBase64");
    expect(scene.attachments.reads).toBe(0);
  });

  it("relue à l'envoi après validation : le gabarit reçoit `pdfBase64`", async () => {
    const scene = await requestedAndDelivered();
    scene.attachments.put(KEY, PDF);

    await scene.afterCommit.commit();

    expect(scene.dispatch.sent).toHaveLength(1);
    expect(scene.dispatch.sent[0]?.data).toMatchObject({
      document: {
        fileName: "confirmation-de-commande-ORD-1.pdf",
        pdfBase64: PDF.toString("base64"),
      },
    });
    expect(scene.dispatch.sent[0]?.data).not.toHaveProperty("document.pdfStored");
    expect(scene.requests.rows.get(PLACED.idempotencyKey)?.status).toBe("sent");
  });

  it("introuvable à l'envoi : rien ne part, la demande est `refused` et dit pourquoi", async () => {
    const scene = await requestedAndDelivered();

    await scene.afterCommit.commit();

    expect(scene.dispatch.sent).toEqual([]);
    const row = scene.requests.rows.get(PLACED.idempotencyKey)?.snapshot();
    expect(row?.status).toBe("refused");
    expect(row?.failureReason).toContain(KEY);
  });

  it("un modèle sans pièce part sans aucune lecture du stockage", async () => {
    const scene = mailScene();

    await scene.port.sendAndAwaitReceipt({
      template: "staff.access-suspended",
      to: "equipe@example.test",
      data: { firstName: "Ada" },
      idempotencyKey: "staff.suspended:no-pdf",
    });

    expect(scene.attachments.reads).toBe(0);
  });

  it("l'erreur d'une pièce absente nomme la clé et le geste de sortie", () => {
    expect(new MailAttachmentMissingError(KEY).message).toMatch(/introuvable.*refaire le geste/s);
  });
});
