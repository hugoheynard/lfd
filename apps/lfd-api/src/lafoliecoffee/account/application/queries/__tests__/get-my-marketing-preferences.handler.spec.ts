import { RecordingMarketingConsent } from "../../../../../mail/channels/marketing/__tests__/recording-marketing-consent.js";
import { GetMyMarketingPreferencesHandler } from "../get-my-marketing-preferences.handler.js";
import { GetMyMarketingPreferencesQuery } from "../get-my-marketing-preferences.query.js";

/**
 * « Mes préférences » et la question de la case à la commande (plan de
 * désinscription, C2 et C3) : l'état du registre, dit comme l'écran le
 * montre, et `askable` seulement sans ligne.
 */
const ADDRESS = "camille@exemple.fr";

async function viewWith(status: "pending" | "accepted" | "unsubscribed" | null) {
  const marketing = new RecordingMarketingConsent();
  if (status !== null) {
    marketing.given("lfc", ADDRESS, status);
  }
  return new GetMyMarketingPreferencesHandler(marketing).execute(
    new GetMyMarketingPreferencesQuery(ADDRESS),
  );
}

describe("GetMyMarketingPreferencesHandler", () => {
  it.each([
    [null, "not_subscribed", true],
    ["pending", "pending", false],
    ["accepted", "subscribed", false],
    ["unsubscribed", "unsubscribed", false],
  ] as const)(
    "registre « %s » → « %s », case à la commande : %s",
    async (status, state, askable) => {
      expect(await viewWith(status)).toEqual({
        spaces: [{ space: "lfc", state, askable }],
        partnersOffered: false,
      });
    },
  );

  it("un compte sans adresse : rien à montrer, et pas de case", async () => {
    const view = await new GetMyMarketingPreferencesHandler(
      new RecordingMarketingConsent(),
    ).execute(new GetMyMarketingPreferencesQuery(""));
    expect(view.spaces).toEqual([{ space: "lfc", state: "not_subscribed", askable: false }]);
  });

  it("dit si la case « partenaires » est proposée, comme le registre", async () => {
    const marketing = new RecordingMarketingConsent();
    marketing.offersPartners = true;
    const view = await new GetMyMarketingPreferencesHandler(marketing).execute(
      new GetMyMarketingPreferencesQuery(ADDRESS),
    );
    expect(view.partnersOffered).toBe(true);
  });
});
