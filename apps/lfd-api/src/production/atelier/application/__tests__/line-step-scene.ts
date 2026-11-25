import type { CatalogFamilyView } from "@lfd/contracts";

import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  article,
  FailingWorkstationOfProducts,
  FixedProductionArticles,
  FixedWorkstationOfProducts,
} from "../../../workstations/application/__tests__/placement-doubles.js";
import { GroupingSourceReading, type WorkstationOfProducts } from "../../../workstations/index.js";
import { MarkStepDoneHandler } from "../commands/mark-step-done.handler.js";
import { MarkStepRedHandler } from "../commands/mark-step-red.handler.js";
import { UndoStepHandler } from "../commands/undo-step.handler.js";
import { LineStepGestures } from "../services/line-step-gestures.service.js";
import { InMemoryLineSteps } from "./line-step-doubles.js";
import { problemScene, SCENE_SKU } from "./problem-scene.js";

/** Le produit du croissant de la scène. */
export const SCENE_PRODUCT = "P-CRO";
/** Le poste d'étape (le pain) et celui qui finit (la garniture). */
export const STEP_STATION = "ws-pain";
export const FINISHING_STATION = "ws-traiteur";
/** Un poste en service qui n'est pas un poste du produit. */
export const OTHER_STATION = "ws-patisserie";

const FAMILY: CatalogFamilyView = { id: "fam-vien", name: "Viennoiseries", position: 0 };

export const SCENE_WORKSTATIONS = [
  { id: STEP_STATION, name: "Boulangerie", position: 0 },
  { id: FINISHING_STATION, name: "Salé traiteur", position: 1 },
  { id: OTHER_STATION, name: "Pâtisserie", position: 2 },
];

/** Un poste du produit, tel que la carte le tient. */
interface SceneStation {
  readonly workstationId: string;
  readonly finishes: boolean;
  readonly position: number | null;
}

/** Le croissant sur deux postes : la Boulangerie fait une étape, le Salé traiteur finit. */
export const TWO_STATIONS: readonly SceneStation[] = [
  { workstationId: FINISHING_STATION, finishes: true, position: null },
  { workstationId: STEP_STATION, finishes: false, position: null },
];

/** Les postes de la carte doublée, pour la scène. */
export function mapOf(stations: readonly SceneStation[] = TWO_STATIONS): WorkstationOfProducts {
  return FixedWorkstationOfProducts.withStations(
    SCENE_WORKSTATIONS,
    new Map([[SCENE_PRODUCT, stations]]),
  );
}

/**
 * **La scène des étapes** — celle du rouge et de « Fait » (`problemScene`),
 * plus la carte des postes et la table des étapes. Ports doublés, le vrai
 * passage commun (`LineStepGestures`) branché dessus.
 */
export function lineStepScene(map: WorkstationOfProducts | "down" = mapOf()) {
  const scene = problemScene();
  const steps = new InMemoryLineSteps();
  const authors = new FixedStaffAuthorDirectory(
    authorsKnownAs({ firstName: "Marie", lastName: "Dupont" }, "staff-1"),
  );
  const intents = inMemoryIntents();
  const gestures = new LineStepGestures(
    scene.days,
    scene.lock,
    new GroupingSourceReading(
      new FixedProductionArticles([article(SCENE_SKU, SCENE_PRODUCT, FAMILY)]),
      map === "down" ? new FailingWorkstationOfProducts() : map,
    ),
    steps.repository(),
    scene.events,
  );
  const sealed = [authors, scene.clock, scene.uow, intents] as const;
  return {
    ...scene,
    steps,
    stepDone: new MarkStepDoneHandler(gestures, ...sealed),
    stepRed: new MarkStepRedHandler(gestures, ...sealed),
    stepUndo: new UndoStepHandler(gestures, ...sealed),
  };
}
