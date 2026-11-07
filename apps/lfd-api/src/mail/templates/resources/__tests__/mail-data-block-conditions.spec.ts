import { MAIL_PREVIEW_SITUATIONS, type MailDataBlockId } from "@lfd/mail-blocks";
import type { LayoutInput } from "@lfd/mailer";

import { b2bMailTemplates, type B2bMails } from "../../mail-templates.js";
import {
  MAIL_SITUATIONS,
  mailSituationsOf,
  situatedDataOf,
} from "../../specimens/cases/mail-situations.js";
import { MAIL_CASE_TABLES } from "../../specimens/cases/mail-specimen-cases.js";
import { mailKeys, renderMailData } from "../../specimens/mail-specimens.js";
import { mailResourcesOf } from "../mail-resources.js";

/**
 * Les conditions d'affichage (plan `plan-editeur-par-blocs.md`, § 24,
 * 2026-11-07) : un bloc de données qu'un cas ou une situation de l'e-mail ne
 * rend pas déclare sa condition, et un bloc que tous rendent n'en déclare
 * aucune. La présence se lit sur l'entrée de la coquille que le VRAI
 * gabarit pose, comme l'aperçu par blocs.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

/** Rend ces données et rend l'entrée de la coquille. */
function layoutOf<K extends keyof B2bMails>(mail: K, data: B2bMails[K]): LayoutInput {
  let captured: LayoutInput | undefined;
  renderMailData(
    REGISTRY,
    mail,
    data,
    {},
    {
      orders: {},
      markers: false,
      editor: {
        capture: (input) => {
          captured ??= input;
        },
      },
    },
  );
  if (captured === undefined) {
    throw new TypeError(`${mail} n'a pas posé la coquille`);
  }
  return captured;
}

/** Chaque cas de l'e-mail, tel quel puis dans chacune de ses situations. */
function renderingsOf(mail: keyof B2bMails): readonly (readonly [string, LayoutInput])[] {
  return MAIL_CASE_TABLES[mail].cases.flatMap(({ id, data }) => {
    const found = data("fr");
    return [
      [id, layoutOf(mail, found)] as const,
      ...mailSituationsOf(mail).flatMap((situation) => {
        const situated = situatedDataOf(mail, found, situation, "fr");
        return situated === null
          ? []
          : [[`${id} en ${situation}`, layoutOf(mail, situated)] as const];
      }),
    ];
  });
}

const PRESENT: Readonly<Record<MailDataBlockId, (input: LayoutInput) => boolean>> = {
  summary: (input) => (input.rows?.length ?? 0) > 0,
  image: (input) => input.image !== undefined,
  itinerary: (input) => input.itinerary !== undefined,
};

describe("la condition d'affichage d'un bloc de données", () => {
  it.each(mailKeys())("de %s est déclarée si et seulement si un rendu l'omet", (mail) => {
    const renderings = renderingsOf(mail);
    const wrong = mailResourcesOf(mail).dataBlocks.flatMap((resource) => {
      const absentIn = renderings
        .filter(([, input]) => !PRESENT[resource.block](input))
        .map(([id]) => id);
      if (absentIn.length > 0 && resource.condition === undefined) {
        return [`${resource.block} : absent de ${absentIn.join(", ")}, sans condition`];
      }
      if (absentIn.length === 0 && resource.condition !== undefined) {
        return [`${resource.block} : toujours rendu, mais déclare « ${resource.condition} »`];
      }
      return [];
    });
    expect(wrong).toEqual([]);
  });

  it("n'est jamais vide quand elle est déclarée", () => {
    const empty = mailKeys().flatMap((mail) =>
      mailResourcesOf(mail)
        .dataBlocks.filter((block) => block.condition?.trim() === "")
        .map((block) => `${mail} ${block.block}`),
    );
    expect(empty).toEqual([]);
  });
});

describe("les situations de l'aperçu", () => {
  /** Les blocs de données de l'exemple de l'e-mail rendus dans cette situation. */
  function shownIn(mail: keyof B2bMails, situation: "pickup" | "delivery"): readonly string[] {
    const specimen = MAIL_CASE_TABLES[mail].cases[0].data("fr");
    const situated = situatedDataOf(mail, specimen, situation, "fr");
    if (situated === null) {
      return [];
    }
    const input = layoutOf(mail, situated);
    return mailResourcesOf(mail)
      .dataBlocks.filter((resource) => PRESENT[resource.block](input))
      .map((resource) => resource.block);
  }

  it.each(mailKeys())("de %s ne sont proposées que si un bloc en dépend", (mail) => {
    const changes = shownIn(mail, "pickup").join() !== shownIn(mail, "delivery").join();
    expect(mailSituationsOf(mail).length > 0).toBe(changes);
  });

  it("rendent l'itinéraire en retrait, et lui seul disparaît en livraison", () => {
    for (const mail of ["customer.order-placed", "customer.order-ready"] as const) {
      expect(shownIn(mail, "pickup")).toEqual(["summary", "image", "itinerary"]);
      expect(shownIn(mail, "delivery")).toEqual(["summary", "image"]);
    }
  });

  it("sont toutes deux servies, dans l'ordre du contrat, pour chaque e-mail qui en a", () => {
    for (const mail of mailKeys()) {
      const expected = MAIL_SITUATIONS[mail] === undefined ? [] : [...MAIL_PREVIEW_SITUATIONS];
      expect(mailSituationsOf(mail)).toEqual(expected);
    }
  });

  /** Un cas déjà en livraison (« Prête à livrer ») revient au point de retrait de l'exemple. */
  it("ramènent au retrait un cas en livraison, sans toucher au reste de ses données", () => {
    const table = MAIL_CASE_TABLES["customer.order-ready"];
    const delivery = table.cases.find((candidate) => candidate.id === "delivery")?.data("fr");
    if (delivery === undefined) {
      throw new TypeError("le cas « delivery » a disparu");
    }
    const situated = situatedDataOf("customer.order-ready", delivery, "pickup", "fr");
    expect(situated?.sheet.fulfillment.method).toBe("pickup");
    expect(situated?.sheet.fulfillment.pickupLabel).toBe("Le Labo");
    expect(situated?.handoverToken).toBe(delivery.handoverToken);
  });
});
