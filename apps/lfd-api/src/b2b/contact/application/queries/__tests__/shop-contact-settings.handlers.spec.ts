import {
  type ContactPhoneView,
  type ContactSettingsView,
  type CustomerAudience,
  DEFAULT_CONTACT_SETTINGS,
  type PublicContactPhoneView,
} from "@lfd/contracts";

import { ContactPhoneReader } from "../../../domain/ports/contact-phone.reader.js";
import { ContactSenderAudience } from "../../../domain/ports/contact-sender-audience.js";
import { ContactSettingsReader } from "../../../domain/ports/contact-settings.reader.js";
import { GetMyShopContactSettingsHandler } from "../get-my-shop-contact-settings.handler.js";
import { GetMyShopContactSettingsQuery } from "../get-my-shop-contact-settings.query.js";
import { GetShopContactSettingsHandler } from "../get-shop-contact-settings.handler.js";
import { GetShopContactSettingsQuery } from "../get-shop-contact-settings.query.js";

const label = { fr: "", en: "", it: "" };
const text = (fr: string) => ({ fr, en: "", it: "" });
const PRO_NUMBER = "04 79 00 00 01";
const SHARED_NUMBER = "04 79 00 00 02";
const INDIVIDUAL_NUMBER = "04 79 00 00 03";

class PublishedPhones extends ContactPhoneReader {
  list(): Promise<ContactPhoneView[]> {
    return Promise.resolve([]);
  }

  published(): Promise<PublicContactPhoneView[]> {
    return Promise.resolve([
      { label, number: PRO_NUMBER, audience: "b2b" },
      { label, number: SHARED_NUMBER, audience: "both" },
      { label, number: INDIVIDUAL_NUMBER, audience: "b2c" },
    ]);
  }
}

class Settings extends ContactSettingsReader {
  current(): Promise<ContactSettingsView> {
    return Promise.resolve({
      ...DEFAULT_CONTACT_SETTINGS,
      cards: {
        b2b: { ...DEFAULT_CONTACT_SETTINGS.cards.b2b, title: text("Carte pros") },
        b2c: { ...DEFAULT_CONTACT_SETTINGS.cards.b2c, title: text("Carte particuliers") },
      },
    });
  }
}

/** Retient la société demandée et rend un public fixé. */
class AskedAudience extends ContactSenderAudience {
  asked: string | null | undefined;

  constructor(private readonly audience: CustomerAudience) {
    super();
  }

  of(companyId: string | null): Promise<CustomerAudience> {
    this.asked = companyId;
    return Promise.resolve(this.audience);
  }
}

const shop = new GetShopContactSettingsHandler(new Settings(), new PublishedPhones());

describe("GetShopContactSettingsHandler — l'audience déclarée", () => {
  it("les particuliers : leur carte et leurs numéros, rien des pros", async () => {
    const served = await shop.execute(new GetShopContactSettingsQuery("b2c"));
    expect(served.card.title.fr).toBe("Carte particuliers");
    expect(served.phones.map((p) => p.number)).toEqual([SHARED_NUMBER, INDIVIDUAL_NUMBER]);
    expect(JSON.stringify(served)).not.toContain("Carte pros");
  });

  it("la vitrine pro : la carte des pros et leurs numéros, rien des particuliers", async () => {
    const served = await shop.execute(new GetShopContactSettingsQuery("b2b"));
    expect(served.card.title.fr).toBe("Carte pros");
    expect(served.phones.map((p) => p.number)).toEqual([PRO_NUMBER, SHARED_NUMBER]);
    expect(JSON.stringify(served)).not.toContain(INDIVIDUAL_NUMBER);
  });
});

describe("GetMyShopContactSettingsHandler — l'audience établie", () => {
  it("lit le public de la société agissante, par la règle du message connecté", async () => {
    const audiences = new AskedAudience("b2b");
    const handler = new GetMyShopContactSettingsHandler(
      new Settings(),
      new PublishedPhones(),
      audiences,
    );
    const served = await handler.execute(new GetMyShopContactSettingsQuery("co_1"));
    expect(audiences.asked).toBe("co_1");
    expect(served.card.title.fr).toBe("Carte pros");
    expect(served.phones.map((p) => p.number)).toEqual([PRO_NUMBER, SHARED_NUMBER]);
  });

  it("un particulier (ou une société non active) : la carte des particuliers", async () => {
    const handler = new GetMyShopContactSettingsHandler(
      new Settings(),
      new PublishedPhones(),
      new AskedAudience("b2c"),
    );
    const served = await handler.execute(new GetMyShopContactSettingsQuery(null));
    expect(served.card.title.fr).toBe("Carte particuliers");
    expect(JSON.stringify(served)).not.toContain(PRO_NUMBER);
  });
});
