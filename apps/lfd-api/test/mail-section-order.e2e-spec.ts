/**
 * E2E de **l'ordre des sections des e-mails** (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, §3, lot E4a) :
 * le brouillon à révision et le refus d'un ordre invalide (400), « Publier »
 * qui met l'ordre en service avec les textes, le courriel envoyé APRÈS dans
 * l'ordre publié et sans repère, l'aperçu repéré, l'itinéraire d'un retrait.
 */
import type { MailCopyAdminView } from "@lfd/contracts";

import { jsonBody } from "./e2e-harness.js";
import { ADMIN, mailCopyScene, ORDER_PLACED } from "./mail-copy-scene.js";

const scene = mailCopyScene();
const { staff, preview, sendPasswordReset } = scene;
const RESET = "customer.password-reset";
const FOOTER_FIRST = ["footer", "title", "body", "cta"];

async function viewOf(mail: string): Promise<MailCopyAdminView["mails"][number] | undefined> {
  const view = jsonBody<MailCopyAdminView>(await staff().get(ADMIN).expect(200));
  return view.mails.find((candidate) => candidate.mail === mail);
}

function putOrder(
  order: readonly string[],
  expectedRevision = 0,
  mail = RESET,
): ReturnType<ReturnType<typeof staff>["put"]> {
  return staff().put(`${ADMIN}/section-orders`).send({ mail, order, expectedRevision });
}

describe("l'ordre des sections, en brouillon", () => {
  it("l'écran expose les sections de chaque e-mail, leur nature et leurs textes", async () => {
    const placed = await viewOf(ORDER_PLACED);
    expect(placed?.sections.map((section) => [section.id, section.nature])).toEqual([
      ["title", "text"],
      ["body", "text"],
      ["summary", "system"],
      ["image", "system"],
      ["itinerary", "system"],
      ["cta", "system"],
      ["secondaryLink", "system"],
      ["footer", "text"],
    ]);
    expect(placed?.sections[0]?.texts).toContainEqual({
      path: "title.paid",
      variant: "Commande payée par carte",
    });
    expect(placed?.sectionOrder).toMatchObject({ draftState: "unchanged", revision: 0 });
  });

  it("pose un ordre (204), refuse la même révision (409) et un ordre incomplet ou un cadre (400)", async () => {
    await putOrder(FOOTER_FIRST).expect(204);
    await putOrder(FOOTER_FIRST, 0).expect(409);
    const missing = await putOrder(["footer", "title"], 1).expect(400);
    expect(jsonBody<{ readonly message: string }>(missing).message).toContain(
      "il manque body, cta",
    );
    const frame = await putOrder(["header", ...FOOTER_FIRST], 1).expect(400);
    expect(jsonBody<{ readonly message: string }>(frame).message).toContain(
      "l'en-tête et le recours restent à leur place",
    );

    const reset = await viewOf(RESET);
    expect(reset?.sections.map((section) => section.id)).toEqual(FOOTER_FIRST);
    expect(reset?.sectionOrder).toMatchObject({ draftState: "set", revision: 1, published: null });
    expect(reset?.pendingCount).toBe(1);
  });
});

describe("« Publier », puis l'envoi", () => {
  it("un courriel envoyé APRÈS publication suit l'ordre publié, sans repère", async () => {
    const before = await sendPasswordReset();
    expect(before?.html.indexOf("<h1")).toBeLessThan(
      before?.html.indexOf("margin:24px 0 0;line-height:1.5;font-size:13px") ?? 0,
    );

    await putOrder(FOOTER_FIRST).expect(204);
    await staff().post(`${ADMIN}/publications`).expect(201);
    const after = await sendPasswordReset();

    expect(after?.html.indexOf("margin:24px 0 0;line-height:1.5;font-size:13px")).toBeLessThan(
      after?.html.indexOf("<h1") ?? 0,
    );
    expect(after?.html).not.toContain("data-mail-section");
    expect(after?.html).not.toContain("data-mail-text");
  });

  it("« Rétablir » rend l'ordre du code au « Publier » suivant", async () => {
    await putOrder(FOOTER_FIRST).expect(204);
    await staff().post(`${ADMIN}/publications`).expect(201);
    await staff()
      .post(`${ADMIN}/section-order-resets`)
      .send({ mail: RESET, expectedRevision: 1 })
      .expect(204);
    await staff().post(`${ADMIN}/publications`).expect(201);

    const sent = await sendPasswordReset();
    expect(sent?.html.indexOf("<h1")).toBeLessThan(
      sent?.html.indexOf("margin:24px 0 0;line-height:1.5;font-size:13px") ?? 0,
    );
    expect((await viewOf(RESET))?.sectionOrder).toMatchObject({
      draftState: "unchanged",
      published: null,
    });
  });
});

describe("l'aperçu repéré et l'itinéraire", () => {
  it("l'aperçu porte un repère par section et par texte, et le bouton d'itinéraire du retrait", async () => {
    const shown = await preview("draft");
    expect(shown.html).toContain('<div data-mail-section="title">');
    expect(shown.html).toContain('data-mail-text="title.paid"');
    expect(shown.html).toContain("https://www.google.com/maps/dir/?api=1&amp;destination=");
    expect(shown.html).toContain('data-mail-text="itinerary"');
  });
});
