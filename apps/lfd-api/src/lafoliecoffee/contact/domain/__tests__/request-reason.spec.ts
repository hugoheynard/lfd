import type { RequestKind } from "@lfd/contracts";

import { InvalidEmailError } from "../../../account/domain/errors/account-errors.js";
import {
  ContactPositionInvalidError,
  ContactTextTooLongError,
  RequestReasonKindImmutableError,
  RequestReasonKindUnknownError,
  RequestReasonLabelMissingError,
} from "../errors/contact-errors.js";
import { RequestReason } from "../request-reason.js";
import { AT, CONTACT_SETTINGS, LATER, reason } from "./request-fixtures.js";

describe("RequestReason — un motif", () => {
  it("se crée avec son type, rogné, et proposé à son formulaire et son public", () => {
    const pro = reason({ label: { fr: "  Devenir client pro ", en: "", it: "" } });
    expect(pro.labelFr).toBe("Devenir client pro");
    expect(pro.kind).toBe("contact");
    expect(pro.isOfferedFor("contact", "b2b")).toBe(true);
  });

  it("n'est pas proposé par un autre formulaire, même actif et visible", () => {
    expect(reason().isOfferedFor("order_problem", "b2b")).toBe(false);
  });

  it("n'est pas proposé à un autre public, ni désactivé, ni archivé", () => {
    expect(reason().isOfferedFor("contact", "b2c")).toBe(false);
    expect(reason({ active: false }).isOfferedFor("contact", "b2b")).toBe(false);
    const archived = reason();
    archived.archive(AT);
    expect(archived.isOfferedFor("contact", "b2b")).toBe(false);
  });

  it("`both` est proposé aux deux publics", () => {
    const both = reason({ audience: "both" });
    expect(both.isOfferedFor("contact", "b2b")).toBe(true);
    expect(both.isOfferedFor("contact", "b2c")).toBe(true);
  });

  it("refuse un motif sans libellé français", () => {
    expect(() => reason({ label: { fr: "  ", en: "Pro", it: "" } })).toThrow(
      RequestReasonLabelMissingError,
    );
  });

  it("refuse un motif sans type connu", () => {
    // Le contrat refuse déjà la forme ; le domaine refuse aussi ce qu'une base mal tenue rendrait.
    const unknown: RequestKind = JSON.parse('"quote"') as RequestKind;
    expect(() => reason({ kind: unknown })).toThrow(RequestReasonKindUnknownError);
  });

  it("refuse une adresse invalide, un rang négatif, un libellé trop long", () => {
    expect(() => reason({ recipientEmail: "pas-une-adresse" })).toThrow(InvalidEmailError);
    expect(() => reason({ position: -1 })).toThrow(ContactPositionInvalidError);
    expect(() => reason({ label: { fr: "x".repeat(81), en: "", it: "" } })).toThrow(
      ContactTextTooLongError,
    );
  });

  it("se révise d'un bloc, mais ne change JAMAIS de formulaire", () => {
    const pro = reason();
    pro.revise({ ...CONTACT_SETTINGS, priority: "low" }, LATER);
    expect(pro.priority).toBe("low");
    expect(() => pro.revise({ ...CONTACT_SETTINGS, kind: "order_problem" }, LATER)).toThrow(
      RequestReasonKindImmutableError,
    );
    expect(pro.kind).toBe("contact");
  });

  it("s'archive une fois : la date du premier archivage reste", () => {
    const pro = reason();
    pro.archive(AT);
    pro.archive(LATER);
    expect(pro.toPersistence().archivedAt).toEqual(AT);
  });

  it("la réhydratation revalide le type lu en base", () => {
    const state = { ...reason().toPersistence(), recipientEmail: "commercial@lfc.fr" };
    expect(RequestReason.rehydrate(state).kind).toBe("contact");
    const corrupt: RequestKind = JSON.parse('"devis"') as RequestKind;
    expect(() => RequestReason.rehydrate({ ...state, kind: corrupt })).toThrow(
      RequestReasonKindUnknownError,
    );
  });
});
