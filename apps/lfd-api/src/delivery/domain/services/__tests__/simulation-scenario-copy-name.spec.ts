import { SIMULATION_SCENARIO_NAME_MAX_LENGTH } from "../../entities/simulation-scenario.js";
import { COPY_NAME_ATTEMPTS, copyNameCandidates } from "../simulation-scenario-copy-name.js";

describe("copyNameCandidates — le nom d'une copie (L9-C7)", () => {
  it("propose « (copie) », puis « (copie 2) », « (copie 3) »…", () => {
    expect(copyNameCandidates("Mardi").slice(0, 3)).toEqual([
      "Mardi (copie)",
      "Mardi (copie 2)",
      "Mardi (copie 3)",
    ]);
    expect(copyNameCandidates("Mardi")).toHaveLength(COPY_NAME_ATTEMPTS);
  });

  it("rogne un nom long pour que le suffixe tienne dans la borne", () => {
    const long = "x".repeat(SIMULATION_SCENARIO_NAME_MAX_LENGTH);

    const names = copyNameCandidates(long);

    expect(names.every((name) => name.length <= SIMULATION_SCENARIO_NAME_MAX_LENGTH)).toBe(true);
    expect(names[0]?.endsWith(" (copie)")).toBe(true);
    expect(names[9]?.endsWith(" (copie 10)")).toBe(true);
  });
});
