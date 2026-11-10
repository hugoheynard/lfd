import { RecordingMarketingConsent } from "../../../../../mail/channels/marketing/__tests__/recording-marketing-consent.js";
import { MarketingWithoutAddressError } from "../../../domain/errors/account-errors.js";
import { AcceptMarketingPartnersCommand } from "../accept-marketing-partners.command.js";
import { AcceptMarketingPartnersHandler } from "../accept-marketing-partners.handler.js";
import { SubscribeMyMarketingCommand } from "../subscribe-my-marketing.command.js";
import { SubscribeMyMarketingHandler } from "../subscribe-my-marketing.handler.js";
import { UnsubscribeMyMarketingCommand } from "../unsubscribe-my-marketing.command.js";
import { UnsubscribeMyMarketingHandler } from "../unsubscribe-my-marketing.handler.js";

/**
 * Les gestes de « Mes préférences » (plan de désinscription, C3) : ce qu'ils
 * demandent au canal du registre. Le registre lui-même s'éprouve dans le
 * bloc `mail`.
 */
const ADDRESS = "camille@exemple.fr";

describe("SubscribeMyMarketingHandler", () => {
  it("passe par la réinscription, lieu « preferences », la preuve du compte", async () => {
    const marketing = new RecordingMarketingConsent();
    await new SubscribeMyMarketingHandler(marketing).execute(
      new SubscribeMyMarketingCommand("u_1", ADDRESS, false, "lfc", "society.v1", "it"),
    );
    expect(marketing.calls).toEqual([
      {
        kind: "resubscribe",
        space: "lfc",
        address: ADDRESS,
        consent: {
          textVersion: "society.v1",
          locale: "it",
          where: "preferences",
          ref: "u_1",
          verified: false,
        },
      },
    ]);
  });

  it("refuse un compte sans adresse, sans rien demander", async () => {
    const marketing = new RecordingMarketingConsent();
    await expect(
      new SubscribeMyMarketingHandler(marketing).execute(
        new SubscribeMyMarketingCommand("u_1", "", true, "lfc", "society.v1", "fr"),
      ),
    ).rejects.toThrow(MarketingWithoutAddressError);
    expect(marketing.calls).toEqual([]);
  });
});

describe("UnsubscribeMyMarketingHandler", () => {
  it("désinscrit l'adresse du compte de cette société, source `link`", async () => {
    const marketing = new RecordingMarketingConsent();
    await new UnsubscribeMyMarketingHandler(marketing).execute(
      new UnsubscribeMyMarketingCommand(ADDRESS, "lfc"),
    );
    expect(marketing.calls).toEqual([
      { kind: "unsubscribe", space: "lfc", address: ADDRESS, source: "link" },
    ]);
  });

  it("refuse un compte sans adresse", async () => {
    await expect(
      new UnsubscribeMyMarketingHandler(new RecordingMarketingConsent()).execute(
        new UnsubscribeMyMarketingCommand("", "lfc"),
      ),
    ).rejects.toThrow(MarketingWithoutAddressError);
  });
});

describe("AcceptMarketingPartnersHandler", () => {
  it("demande « partenaires » depuis la boutique, lieu « preferences »", async () => {
    const marketing = new RecordingMarketingConsent();
    await new AcceptMarketingPartnersHandler(marketing).execute(
      new AcceptMarketingPartnersCommand("u_1", ADDRESS, true, "partners.v1", "fr"),
    );
    expect(marketing.calls).toEqual([
      {
        kind: "partners",
        space: "lfc",
        address: ADDRESS,
        consent: {
          textVersion: "partners.v1",
          locale: "fr",
          where: "preferences",
          ref: "u_1",
          verified: true,
        },
      },
    ]);
  });
});
