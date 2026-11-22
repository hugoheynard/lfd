import { RegisteredLinkableSubjects } from "../../../../channels/subjects/linkable-subjects.js";
import { PayLink } from "../../../domain/entities/pay-link.js";
import {
  PayLinkNotFoundError,
  SubjectNotLinkableError,
} from "../../../domain/errors/pay-link-errors.js";
import { LivePayLinkLookup } from "../../live-pay-link-lookup.js";
import {
  InMemoryPayLinks,
  ScriptedLinkable,
  TransparentVault,
} from "../../__tests__/pay-link-doubles.js";
import { ViewPayLinkHandler } from "../view-pay-link.handler.js";
import { ViewPayLinkQuery } from "../view-pay-link.query.js";

async function scene(subjectType = "free_charge") {
  const links = new InMemoryPayLinks();
  await links.addIfAbsent(
    PayLink.open({
      id: "pl_1",
      subjectType,
      subjectId: "fc_1",
      origin: "lafoliecoffee",
      payerLabel: "Café des Arts",
      tokenHash: "hash:tok_1",
      tokenSealed: "sealed:tok_1",
      at: new Date(0),
      by: "system",
      byLabel: null,
    }),
  );
  const linkable = new ScriptedLinkable();
  const handler = new ViewPayLinkHandler(
    new LivePayLinkLookup(links, new TransparentVault()),
    new RegisteredLinkableSubjects([linkable]),
  );
  return { links, linkable, view: (token: string) => handler.execute(new ViewPayLinkQuery(token)) };
}

describe("ViewPayLinkHandler", () => {
  it("rend le devis du sujet du lien, lu à l'ouverture", async () => {
    const { linkable, view } = await scene();
    await expect(view("tok_1")).resolves.toMatchObject({ payable: true, amountCents: 12_500 });
    expect(linkable.asked).toEqual([{ type: "free_charge", id: "fc_1" }]);
  });

  it("dit qu'un sujet réglé n'est plus payable, sans 404", async () => {
    const { linkable, view } = await scene();
    linkable.quote_ = { payable: false, reason: "settled" };
    await expect(view("tok_1")).resolves.toEqual({ payable: false, reason: "settled" });
  });

  it("répond 404 à un jeton inconnu", async () => {
    const { view } = await scene();
    await expect(view("tok_x")).rejects.toBeInstanceOf(PayLinkNotFoundError);
  });

  it("refuse un lien dont le type n'a plus d'implémenteur", async () => {
    const { view } = await scene("invoice");
    await expect(view("tok_1")).rejects.toBeInstanceOf(SubjectNotLinkableError);
  });
});
