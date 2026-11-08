import { RecordingMarketingConsent } from "../../../../../mail/channels/marketing/__tests__/recording-marketing-consent.js";
import { HeldAfterCommit } from "../../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { OrderMarketingConsent } from "../order-marketing-consent.js";

/**
 * La case des offres à la passation (plan de désinscription, C2, règles 17,
 * 18, 21) : rien avant la validation, rien sans case cochée, et la preuve de
 * l'adresse telle que l'acheteur la porte.
 */
const ANSWER = { accepted: true, textVersion: "society.v1", locale: "fr" } as const;

function world() {
  const marketing = new RecordingMarketingConsent();
  const afterCommit = new HeldAfterCommit();
  return {
    marketing,
    afterCommit,
    consent: new OrderMarketingConsent(marketing, afterCommit, new BackgroundWork()),
  };
}

describe("OrderMarketingConsent", () => {
  it("un invité qui coche : la demande part APRÈS la validation, jamais prouvée", async () => {
    const { marketing, afterCommit, consent } = world();

    consent.collect("ord_1", { address: "invite@exemple.fr", addressProven: false }, ANSWER);
    expect(marketing.calls).toEqual([]);
    await afterCommit.commit();

    expect(marketing.calls).toEqual([
      {
        kind: "request",
        space: "lfc",
        address: "invite@exemple.fr",
        consent: {
          textVersion: "society.v1",
          locale: "fr",
          where: "order",
          ref: "ord_1",
          verified: false,
        },
      },
    ]);
  });

  it("un client connecté à l'adresse prouvée : la demande le dit", async () => {
    const { marketing, afterCommit, consent } = world();
    consent.collect("ord_2", { address: "client@exemple.fr", addressProven: true }, ANSWER);
    await afterCommit.commit();
    expect(marketing.calls[0]).toMatchObject({ consent: { verified: true, ref: "ord_2" } });
  });

  it("une case non cochée, absente, ou sans acheteur : rien", async () => {
    const { marketing, afterCommit, consent } = world();
    const buyer = { address: "x@exemple.fr", addressProven: false };
    consent.collect("ord_1", buyer, { ...ANSWER, accepted: false });
    consent.collect("ord_1", buyer, undefined);
    consent.collect("ord_1", null, ANSWER);
    consent.collect("ord_1", { address: "", addressProven: true }, ANSWER);
    await afterCommit.commit();
    expect(marketing.calls).toEqual([]);
  });

  it("une commande qui n'a pas pris (unité abandonnée) : rien", async () => {
    const { marketing, afterCommit, consent } = world();
    consent.collect("ord_1", { address: "x@exemple.fr", addressProven: false }, ANSWER);
    afterCommit.discard();
    await afterCommit.commit();
    expect(marketing.calls).toEqual([]);
  });
});
