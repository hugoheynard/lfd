import type { SellableOperation } from "../../../../catalog/domain/ports/catalog-operations.reader.js";
import {
  OperationArticleUnavailableError,
  OperationClosedError,
  OperationDayOutsideError,
  OperationDayRequiredError,
  OperationNotYetOpenError,
} from "../../errors/order-operation-errors.js";
import { ensureWithinOperation, type LineOperationAccess } from "../order-operation-guard.js";

/**
 * D6 : les refus d'une opération datée, et leurs mots. Aucune horloge ici — la
 * réponse de D4 est déjà calculée —, donc les dates ne servent qu'au message.
 */

const NOEL: SellableOperation = {
  key: "noel-2026",
  name: { fr: "Noël" },
  lede: null,
  image: null,
  announceFrom: new Date("2026-10-31T23:00:00.000Z"),
  // 15 novembre, minuit à Paris.
  orderFrom: new Date("2026-11-14T23:00:00.000Z"),
  // 21 décembre, 12 h à Paris.
  orderUntil: new Date("2026-12-21T11:00:00.000Z"),
  pickupFrom: "2026-12-20",
  pickupUntil: "2026-12-24",
  audience: "both",
  skus: ["PAT-9-1"],
};

function buche(access: LineOperationAccess["access"]): LineOperationAccess {
  return { sku: "PAT-9", productName: "Bûche", access };
}

const closed = (reason: "not_yet_open" | "closed" | "day_outside" | "no_day") =>
  buche({ status: "closed", reason, operation: NOEL });

describe("ensureWithinOperation", () => {
  it("laisse passer l'article courant, le montré sans jour et le commandable", () => {
    expect(() =>
      ensureWithinOperation([
        { sku: "VIE-001", productName: "Croissant", access: "free" },
        buche("shown"),
        buche("orderable"),
      ]),
    ).not.toThrow();
  });

  it("refuse l'article qu'aucune opération ne montre, sans le dire « inconnu »", () => {
    expect(() => ensureWithinOperation([buche("absent")])).toThrow(
      new OperationArticleUnavailableError("PAT-9", "Bûche"),
    );
    expect(() => ensureWithinOperation([buche("absent")])).toThrow(
      "« Bûche » n’est vendu que pendant une opération",
    );
  });

  it("dit le jour d'ouverture, à minuit sans heure", () => {
    expect(() => ensureWithinOperation([closed("not_yet_open")])).toThrow(OperationNotYetOpenError);
    expect(() => ensureWithinOperation([closed("not_yet_open")])).toThrow(
      "Les commandes de « Noël » ouvrent le 15 novembre.",
    );
  });

  it("dit l'instant de clôture, heure de Paris", () => {
    expect(() => ensureWithinOperation([closed("closed")])).toThrow(OperationClosedError);
    expect(() => ensureWithinOperation([closed("closed")])).toThrow(
      "Les commandes de « Noël » sont closes depuis le 21 décembre à 12 h.",
    );
  });

  it("dit les jours de retrait quand le jour est hors de la fenêtre", () => {
    expect(() => ensureWithinOperation([closed("day_outside")])).toThrow(OperationDayOutsideError);
    expect(() => ensureWithinOperation([closed("day_outside")])).toThrow(
      "« Bûche » se retire du 20 au 24 décembre.",
    );
  });

  it("demande un jour quand la commande n'en porte pas", () => {
    expect(() => ensureWithinOperation([closed("no_day")])).toThrow(OperationDayRequiredError);
    expect(() => ensureWithinOperation([closed("no_day")])).toThrow(
      "Choisissez un jour de retrait entre le 20 et le 24 décembre pour « Bûche ».",
    );
  });

  it("refuse le panier entier sur la première ligne qui ne passe pas", () => {
    expect(() =>
      ensureWithinOperation([
        { sku: "VIE-001", productName: "Croissant", access: "free" },
        closed("closed"),
        buche("absent"),
      ]),
    ).toThrow(OperationClosedError);
  });

  it("porte les dates brutes sur l'erreur, pour qu'un écran les reformate", () => {
    const error = new OperationClosedError("PAT-9", NOEL.key, NOEL.orderUntil, "Noël");
    expect(error).toMatchObject({ operationKey: "noel-2026", closedAt: NOEL.orderUntil });
  });

  it("dit « le 24 décembre » quand la fenêtre de retrait tient en un jour", () => {
    const oneDay = { ...NOEL, pickupFrom: "2026-12-24", pickupUntil: "2026-12-24" };
    expect(() =>
      ensureWithinOperation([
        buche({ status: "closed", reason: "day_outside", operation: oneDay }),
      ]),
    ).toThrow("« Bûche » se retire le 24 décembre.");
  });
});
