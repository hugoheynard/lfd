import { DeclaredCardAccountDefaults } from "../../../../platform/config/card-accounts.js";
import { GetCardPublishableKeyQuery } from "../../../channels/requests/index.js";
import {
  CardAccountUnavailableError,
  NoCardAccountForSubjectTypeError,
} from "../../../domain/errors/card-payment-errors.js";
import {
  RecordingCardProvider,
  StaticCardProviders,
} from "../../__tests__/card-payment-doubles.js";
import { CardAccountChoice } from "../../card-account-choice.js";
import { GetCardPublishableKeyHandler } from "../get-card-publishable-key.handler.js";

function handlerWith(instantiated: boolean): GetCardPublishableKeyHandler {
  const providers = new StaticCardProviders(
    new Map(instantiated ? [["lfc-stripe", new RecordingCardProvider("pk_live_42")]] : []),
  );
  return new GetCardPublishableKeyHandler(
    new CardAccountChoice(new DeclaredCardAccountDefaults({ order: "lfc-stripe" }), providers),
  );
}

describe("GetCardPublishableKeyHandler", () => {
  it("rend la clé publique du compte du type de sujet", async () => {
    await expect(handlerWith(true).execute(new GetCardPublishableKeyQuery("order"))).resolves.toBe(
      "pk_live_42",
    );
  });

  it("refuse un type sans compte", async () => {
    await expect(
      handlerWith(true).execute(new GetCardPublishableKeyQuery("mandate")),
    ).rejects.toBeInstanceOf(NoCardAccountForSubjectTypeError);
  });

  it("refuse un compte non configuré", async () => {
    await expect(
      handlerWith(false).execute(new GetCardPublishableKeyQuery("order")),
    ).rejects.toBeInstanceOf(CardAccountUnavailableError);
  });
});
