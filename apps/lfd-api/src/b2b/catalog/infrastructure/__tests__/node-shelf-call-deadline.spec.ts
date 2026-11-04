import { NodeShelfCallDeadline } from "../node-shelf-call-deadline.js";

/** Le délai sur un vrai minuteur — quelques millisecondes réelles. */
describe("NodeShelfCallDeadline", () => {
  it("rend la valeur d'un appel tenu dans le délai", async () => {
    await expect(new NodeShelfCallDeadline().within(Promise.resolve(42), 50)).resolves.toEqual({
      kind: "in_time",
      value: 42,
    });
  });

  it("abandonne un appel qui ne répond pas", async () => {
    const never = new Promise<number>(() => undefined);
    await expect(new NodeShelfCallDeadline().within(never, 5)).resolves.toEqual({ kind: "late" });
  });

  it("laisse rejeter un appel qui échoue dans le délai", async () => {
    const failing = Promise.reject(new RangeError("panne"));
    await expect(new NodeShelfCallDeadline().within(failing, 50)).rejects.toThrow("panne");
  });
});
