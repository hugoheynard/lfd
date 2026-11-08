import type { MarketingConsentRequest } from "../../../channels/marketing/marketing-consent.js";
import { MarketingPartnersNotOfferedError } from "../../domain/errors/marketing-preference.errors.js";
import { MarketingGroup } from "../../domain/services/marketing-group.js";
import { ConfirmConsentByTokenCommand } from "../commands/confirm-consent-by-token.command.js";
import { SubscribeNewsletterCommand } from "../commands/subscribe-newsletter.command.js";
import { SubscribeNewsletterHandler } from "../commands/subscribe-newsletter.handler.js";
import { marketingWorld, NOW, SHOP_ORIGIN } from "./marketing-world.js";

/**
 * **Le canal tel que C2, C3 et C5 l'appellent** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règles 13, 17, 18,
 * 19, 24) — `askable`, la réinscription, « partenaires », le déménagement
 * d'adresse et la lettre du pied de page, sur les doubles du bloc.
 */

const ADDRESS = "colette@halles.fr";
const NEXT = "colette@neuve.fr";

const PREFERENCES: MarketingConsentRequest = {
  textVersion: "society.v1",
  locale: "fr",
  where: "preferences",
  ref: "u_1",
  verified: true,
};
const UNVERIFIED_PREFERENCES: MarketingConsentRequest = { ...PREFERENCES, verified: false };
const ORDER: MarketingConsentRequest = { ...PREFERENCES, where: "order", ref: "cmd_1" };

type World = ReturnType<typeof marketingWorld>;

function rowOf(world: World, address: string = ADDRESS, space: "lfc" | "lfd" = "lfc") {
  return world.preferences.rows.get(`${space}|${world.addresses.of(address).print}`) ?? null;
}

function tokenOfLastLink(world: World): string {
  const data = world.mail.queued.at(-1)?.data;
  const url =
    typeof data === "object" && data !== null && "confirmUrl" in data
      ? String(data.confirmUrl)
      : "";
  return url.slice(`${SHOP_ORIGIN}/api/lfd/mail/marketing/confirm/`.length);
}

describe("askable — la case ne se montre que sans ligne (règle 17)", () => {
  it("vrai pour une adresse jamais demandée, faux dès qu'une ligne existe", async () => {
    const world = marketingWorld();
    expect(await world.consent.askable("lfc", ADDRESS)).toBe(true);

    await world.consent.request("lfc", ADDRESS, { ...ORDER, verified: false });
    expect(await world.consent.askable("lfc", ADDRESS)).toBe(false);

    await world.consent.unsubscribe("lfc", ADDRESS, "link");
    expect(await world.consent.askable("lfc", ADDRESS)).toBe(false);
    // Par espace : l'autre société n'a rien.
    expect(await world.consent.askable("lfd", ADDRESS)).toBe(true);
  });
});

describe("resubscribe — « Mes préférences », le seul geste qui réinscrit", () => {
  it("jamais demandée : la demande ordinaire, `accepted` pour une adresse vérifiée", async () => {
    const world = marketingWorld();
    await world.consent.resubscribe("lfc", ADDRESS, PREFERENCES);
    expect(rowOf(world)?.snapshot()).toMatchObject({
      status: "accepted",
      proof: { place: "preferences" },
    });
  });

  it("désinscrite, compte vérifié : réinscrite d'emblée, sans e-mail", async () => {
    const world = marketingWorld();
    await world.consent.unsubscribe("lfc", ADDRESS, "link");

    await world.consent.resubscribe("lfc", ADDRESS, PREFERENCES);

    expect(rowOf(world)?.snapshot()).toMatchObject({ status: "accepted", unsubscribedAt: null });
    expect(world.mail.queued).toEqual([]);
  });

  it("désinscrite, compte NON vérifié : en attente, un e-mail, et confirmée au clic", async () => {
    const world = marketingWorld();
    await world.consent.unsubscribe("lfc", ADDRESS, "link");

    await world.consent.resubscribe("lfc", ADDRESS, UNVERIFIED_PREFERENCES);

    expect(rowOf(world)?.snapshot()).toMatchObject({ status: "pending", unsubscribedAt: NOW });
    expect(world.mail.queued).toHaveLength(1);
    await world.confirm.execute(new ConfirmConsentByTokenCommand(tokenOfLastLink(world)));
    expect(rowOf(world)?.snapshot()).toMatchObject({ status: "accepted", unsubscribedAt: null });
  });

  it("une réinscription en attente ne se confirme JAMAIS par une case, même vérifiée", async () => {
    const world = marketingWorld();
    await world.consent.unsubscribe("lfc", ADDRESS, "link");
    await world.consent.resubscribe("lfc", ADDRESS, UNVERIFIED_PREFERENCES);

    await world.consent.request("lfc", ADDRESS, ORDER);

    expect(rowOf(world)?.snapshot().status).toBe("pending");
  });

  it("chaque réinscription a son propre e-mail : la clé porte l'instant de la demande", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, { ...ORDER, verified: false });
    await world.confirm.execute(new ConfirmConsentByTokenCommand(tokenOfLastLink(world)));
    await world.consent.unsubscribe("lfc", ADDRESS, "link");
    world.clock.set(new Date(NOW.getTime() + 1000));

    await world.consent.resubscribe("lfc", ADDRESS, UNVERIFIED_PREFERENCES);

    const keys = world.mail.queued.map((mail) => mail.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
  });
});

describe("requestPartners — la case « partenaires » (règles 14, 19, 20)", () => {
  it("éteinte tant que le groupe n'a pas deux sociétés marketing : refusée, rien de rangé", async () => {
    const world = marketingWorld();
    expect(world.consent.partnersOffered()).toBe(false);
    await expect(world.consent.requestPartners("lfc", ADDRESS, PREFERENCES)).rejects.toThrow(
      MarketingPartnersNotOfferedError,
    );
    expect(world.preferences.rows.size).toBe(0);
  });

  it("allumée : un accord d'origine `partners` pour chacune des AUTRES sociétés", async () => {
    const world = marketingWorld(new MarketingGroup(["lfc", "lfd"]));
    expect(world.consent.partnersOffered()).toBe(true);

    await world.consent.requestPartners("lfc", ADDRESS, PREFERENCES);

    expect(rowOf(world, ADDRESS, "lfd")?.snapshot()).toMatchObject({
      status: "accepted",
      origin: "partners",
    });
    expect(rowOf(world, ADDRESS, "lfc")).toBeNull();
  });
});

describe("moveAddress — l'état suit l'adresse (règle 24)", () => {
  it("un accord déménage : la nouvelle adresse est accordée, l'ancienne n'a plus rien", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, ORDER);

    await world.consent.moveAddress(null, ADDRESS, NEXT);

    expect(await world.consent.preferenceOf("lfc", NEXT)).toBe("accepted");
    expect(await world.consent.preferenceOf("lfc", ADDRESS)).toBeNull();
  });

  it("une désinscription protège la nouvelle adresse, ET reste sur l'ancienne", async () => {
    const world = marketingWorld();
    await world.consent.unsubscribe("lfc", ADDRESS, "link");

    await world.consent.moveAddress(null, ADDRESS, NEXT);

    expect(rowOf(world, NEXT)?.snapshot()).toMatchObject({
      status: "unsubscribed",
      unsubscribedAt: NOW,
      unsubscribedSource: "link",
    });
    expect(await world.consent.preferenceOf("lfc", ADDRESS)).toBe("unsubscribed");
  });

  it("la nouvelle adresse déjà accordée : un « non » de l'ancienne l'emporte", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", NEXT, ORDER);
    await world.consent.unsubscribe("lfc", ADDRESS, "link");

    await world.consent.moveAddress(null, ADDRESS, NEXT);

    expect(await world.consent.preferenceOf("lfc", NEXT)).toBe("unsubscribed");
  });

  it("la nouvelle adresse désinscrite : un accord de l'ancienne ne la réinscrit pas", async () => {
    const world = marketingWorld();
    await world.consent.unsubscribe("lfc", NEXT, "link");
    await world.consent.request("lfc", ADDRESS, ORDER);

    await world.consent.moveAddress(null, ADDRESS, NEXT);

    expect(await world.consent.preferenceOf("lfc", NEXT)).toBe("unsubscribed");
  });

  it("la nouvelle adresse en attente : un accord de l'ancienne la confirme", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", NEXT, { ...ORDER, verified: false });
    await world.consent.request("lfc", ADDRESS, ORDER);

    await world.consent.moveAddress(null, ADDRESS, NEXT);

    expect(await world.consent.preferenceOf("lfc", NEXT)).toBe("accepted");
  });

  it("un espace nommé ne déménage que lui", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, ORDER);
    await world.consent.unsubscribe("lfd", ADDRESS, "link");

    await world.consent.moveAddress("lfd", ADDRESS, NEXT);

    expect(await world.consent.preferenceOf("lfd", NEXT)).toBe("unsubscribed");
    expect(await world.consent.preferenceOf("lfc", NEXT)).toBeNull();
    expect(await world.consent.preferenceOf("lfc", ADDRESS)).toBe("accepted");
  });

  it("la même adresse (casse comprise) : rien ne bouge", async () => {
    const world = marketingWorld();
    await world.consent.request("lfc", ADDRESS, ORDER);
    const saves = world.preferences.saves;

    await world.consent.moveAddress(null, ADDRESS, ADDRESS.toUpperCase());

    expect(world.preferences.saves).toBe(saves);
  });
});

describe("la lettre du pied de page (C5)", () => {
  function newsletter(world: World, address: string, honeypot = "") {
    return new SubscribeNewsletterHandler(world.consent).execute(
      new SubscribeNewsletterCommand(address, "newsletter.v1", "it", honeypot),
    );
  }

  it("une adresse jamais demandée : en attente, et l'e-mail de confirmation dans sa langue", async () => {
    const world = marketingWorld();
    await newsletter(world, ADDRESS);
    expect(rowOf(world)?.snapshot()).toMatchObject({
      status: "pending",
      proof: { place: "newsletter", ref: null, textVersion: "newsletter.v1", locale: "it" },
    });
    expect(world.mail.queued).toHaveLength(1);
  });

  it("une adresse désinscrite n'est pas réinscrite et ne reçoit rien", async () => {
    const world = marketingWorld();
    await world.consent.unsubscribe("lfc", ADDRESS, "link");
    await newsletter(world, ADDRESS);
    expect(rowOf(world)?.snapshot().status).toBe("unsubscribed");
    expect(world.mail.queued).toEqual([]);
  });

  it("le champ piège rempli : rien d'écrit, rien d'envoyé", async () => {
    const world = marketingWorld();
    await newsletter(world, ADDRESS, "https://spam.example");
    expect(world.preferences.rows.size).toBe(0);
    expect(world.mail.queued).toEqual([]);
  });
});
