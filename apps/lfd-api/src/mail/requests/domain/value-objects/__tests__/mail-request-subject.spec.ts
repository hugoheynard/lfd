import { InvalidMailRequestError } from "../../errors/mail-request.errors.js";
import { mailRequestSubjectOf, mailRequestSubjectsOf } from "../mail-request-subject.js";

describe("mailRequestSubjectOf", () => {
  it("relit l'abonné de la vitrine comme un type connu (ajouté au lot E5)", () => {
    expect(mailRequestSubjectOf("vitrine_subscriber", "sub_1")).toEqual({
      type: "vitrine_subscriber",
      id: "sub_1",
    });
  });

  it("refuse un type hors de la liste fermée", () => {
    expect(() => mailRequestSubjectOf("agency", "sub_1")).toThrow(InvalidMailRequestError);
  });

  it("refuse un identifiant blanc", () => {
    expect(() => mailRequestSubjectOf("order", "  ")).toThrow(InvalidMailRequestError);
  });
});

describe("mailRequestSubjectsOf", () => {
  it("garde l'ordre et retire les doublons", () => {
    expect(
      mailRequestSubjectsOf([
        { type: "invoice", id: "inv_1" },
        { type: "order", id: "ord_1" },
        { type: "order", id: "ord_1" },
      ]),
    ).toEqual([
      { type: "invoice", id: "inv_1" },
      { type: "order", id: "ord_1" },
    ]);
  });
});
