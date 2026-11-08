import { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import { MarketingConfirmationUnavailableError } from "../../domain/errors/marketing-preference.errors.js";
import { CONSENT_CONFIRMATION_DAYS } from "../../domain/services/consent-confirmation.js";
import { ConfirmConsentByTokenCommand } from "../commands/confirm-consent-by-token.command.js";
import type { MarketingConsentRequest } from "../../../channels/marketing/marketing-consent.js";
import { marketingWorld, NOW, SHOP_ORIGIN } from "./marketing-world.js";

/**
 * **La demande d'accord et sa double confirmation** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règles 17, 18,
 * 20 ; lot C1) — le bloc monté à la main sur ses doubles.
 */

const ADDRESS = "Colette@Halles.fr";
const KEY = "colette@halles.fr";
const DAY_MS = 24 * 60 * 60 * 1000;

const UNVERIFIED: MarketingConsentRequest = {
  textVersion: "case-commande-v1",
  locale: "it",
  where: "order",
  ref: "cmd_42",
  verified: false,
};
const VERIFIED: MarketingConsentRequest = { ...UNVERIFIED, where: "signup", verified: true };

function rowOf(world: ReturnType<typeof marketingWorld>, space: "lfc" | "lfd" = "lfc") {
  return world.preferences.rows.get(`${space}|${world.addresses.of(ADDRESS).print}`) ?? null;
}

/** Le jeton du lien de l'e-mail envoyé, lu dans les données de la demande. */
function tokenOfSentLink(world: ReturnType<typeof marketingWorld>): string {
  const data = world.mail.queued[0]?.data;
  const url =
    typeof data === "object" && data !== null && "confirmUrl" in data
      ? String(data.confirmUrl)
      : "";
  return url.slice(`${SHOP_ORIGIN}/api/lfd/mail/marketing/confirm/`.length);
}

describe("request — une adresse jamais demandée", () => {
  it("vérifiée : `accepted` tout de suite, avec sa preuve complète, sans e-mail", async () => {
    const world = marketingWorld();

    await world.consent.request("lfc", ADDRESS, VERIFIED);

    expect(rowOf(world)?.snapshot()).toMatchObject({
      status: "accepted",
      recipientKey: KEY,
      origin: "direct",
      proof: { textVersion: "case-commande-v1", locale: "it", place: "signup", ref: "cmd_42" },
      requestedAt: NOW,
      confirmedAt: NOW,
    });
    expect(world.mail.queued).toEqual([]);
  });

  it("non vérifiée : `pending`, et un e-mail TRANSACTIONNEL de confirmation dans sa langue", async () => {
    const world = marketingWorld();

    await world.consent.request("lfc", ADDRESS, UNVERIFIED);

    expect(rowOf(world)?.snapshot()).toMatchObject({
      status: "pending",
      origin: "direct",
      proof: { place: "order", ref: "cmd_42", locale: "it" },
      requestedAt: NOW,
      confirmedAt: null,
    });
    const token = tokenOfSentLink(world);
    expect(world.mail.queued).toEqual([
      {
        template: "customer.marketing-confirm",
        to: KEY,
        data: {
          confirmUrl: `${SHOP_ORIGIN}/api/lfd/mail/marketing/confirm/${token}`,
          locale: "it",
        },
        idempotencyKey: `marketing.confirm:${rowOf(world)?.id ?? ""}:${String(NOW.getTime())}`,
        subjects: [],
      },
    ]);
    // Le lien désigne CETTE demande : l'adresse, l'espace, l'instant.
    expect(world.confirmTokens.open(token)).toEqual({
      space: "lfc",
      recipientKey: KEY,
      issuedAt: NOW,
    });
  });

  it("l'espace qui ne sait pas confirmer refuse, et RIEN n'est rangé", async () => {
    const world = marketingWorld();

    await expect(world.consent.request("lfd", ADDRESS, UNVERIFIED)).rejects.toBeInstanceOf(
      MarketingConfirmationUnavailableError,
    );
    expect(world.preferences.rows.size).toBe(0);
    expect(world.mail.queued).toEqual([]);
  });
});

describe("request — une adresse déjà au registre", () => {
  it("désinscrite : jamais repassée, ni ligne ni e-mail (règle 17)", async () => {
    const world = marketingWorld();
    await world.consent.unsubscribe("lfc", ADDRESS, "link");
    const before = rowOf(world)?.snapshot();

    await world.consent.request("lfc", ADDRESS, UNVERIFIED);
    await world.consent.request("lfc", ADDRESS, VERIFIED);

    expect(rowOf(world)?.snapshot()).toEqual(before);
    expect(world.mail.queued).toEqual([]);
  });

  it("acceptée : rien ne change, aucun e-mail", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, VERIFIED);
    const saves = world.preferences.saves;

    await world.consent.request("lfc", ADDRESS, UNVERIFIED);

    expect(world.preferences.saves).toBe(saves);
    expect(world.mail.queued).toEqual([]);
  });

  it("en attente : une adresse non vérifiée ne renvoie rien — le premier lien vaut encore", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, UNVERIFIED);

    await world.consent.request("lfc", ADDRESS, UNVERIFIED);

    expect(world.mail.queued).toHaveLength(1);
  });

  it("en attente : une adresse vérifiée confirme", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, UNVERIFIED);

    await world.consent.request("lfc", ADDRESS, VERIFIED);

    expect(rowOf(world)?.snapshot()).toMatchObject({ status: "accepted", confirmedAt: NOW });
  });
});

describe("le lien de confirmation (règle 18)", () => {
  it("le clic fait passer la demande `accepted`", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, UNVERIFIED);

    await world.confirm.execute(new ConfirmConsentByTokenCommand(tokenOfSentLink(world)));

    expect(rowOf(world)?.snapshot()).toMatchObject({ status: "accepted", confirmedAt: NOW });
  });

  it("rejoué : rien n'est réécrit", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, UNVERIFIED);
    const token = tokenOfSentLink(world);
    await world.confirm.execute(new ConfirmConsentByTokenCommand(token));
    const saves = world.preferences.saves;

    await world.confirm.execute(new ConfirmConsentByTokenCommand(token));

    expect(world.preferences.saves).toBe(saves);
  });

  it(`expiré au bout de ${String(CONSENT_CONFIRMATION_DAYS)} jours : rien n'est écrit`, async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, UNVERIFIED);
    const token = tokenOfSentLink(world);
    world.clock.set(new Date(NOW.getTime() + CONSENT_CONFIRMATION_DAYS * DAY_MS));

    await world.confirm.execute(new ConfirmConsentByTokenCommand(token));

    expect(rowOf(world)?.snapshot().status).toBe("pending");
  });

  it("altéré, ou d'une autre demande : rien n'est écrit, rien ne lève", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, UNVERIFIED);
    const other = world.confirmTokens.seal({
      space: "lfc",
      recipientKey: KEY,
      issuedAt: new Date(NOW.getTime() - 1),
    });

    await world.confirm.execute(new ConfirmConsentByTokenCommand("n'importe quoi"));
    await world.confirm.execute(new ConfirmConsentByTokenCommand(other));

    expect(rowOf(world)?.snapshot().status).toBe("pending");
  });

  it("une adresse désinscrite entre la demande et le clic ne repasse pas `accepted`", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, UNVERIFIED);
    const token = tokenOfSentLink(world);
    await world.consent.unsubscribe("lfc", ADDRESS, "link");

    await world.confirm.execute(new ConfirmConsentByTokenCommand(token));

    expect(rowOf(world)?.snapshot().status).toBe("unsubscribed");
  });
});

describe("confirmIssued — l'agrégat ne confirme que SA demande", () => {
  it("rend faux pour un autre instant, et pour une ligne déjà confirmée", () => {
    const world = marketingWorld();
    const pending = MarketingPreference.requested("p", "lfc", world.addresses.of(ADDRESS), {
      proof: { textVersion: "v", locale: "fr", place: "order", ref: null },
      origin: "direct",
      at: NOW,
    });

    expect(pending.confirmIssued(new Date(NOW.getTime() + 1), NOW)).toBe(false);
    expect(pending.confirmIssued(NOW, NOW)).toBe(true);
    expect(pending.confirmIssued(NOW, NOW)).toBe(false);
  });
});
