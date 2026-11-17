import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import { RequestMethod, type Type } from "@nestjs/common";

import {
  ADMIN_PERMISSION_KEY,
  ADMIN_RESOURCE_KEY,
} from "../../platform/auth/admin-surface.keys.js";
import { IS_PUBLIC_KEY } from "../../platform/auth/public.decorator.js";
import { ProductionModule } from "../production.module.js";

/** Une ligne de la table : ce qu'un appelant voit d'une route, sans le nom de sa classe. */
function describeRoute(controller: Type, method: string): string | null {
  const handler: unknown = Reflect.get(controller.prototype, method);
  if (typeof handler !== "function") return null;
  const verb: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
  if (typeof verb !== "number") return null;
  const prefix = String(Reflect.getMetadata(PATH_METADATA, controller));
  const path = String(Reflect.getMetadata(PATH_METADATA, handler));
  const full = [prefix, path].filter((part) => part !== "" && part !== "/").join("/");
  const resource = String(Reflect.getMetadata(ADMIN_RESOURCE_KEY, controller) ?? "-");
  const permissions: unknown = Reflect.getMetadata(ADMIN_PERMISSION_KEY, handler) ?? [];
  const code: unknown = Reflect.getMetadata(HTTP_CODE_METADATA, handler) ?? "-";
  const isPublic: unknown = Reflect.getMetadata(IS_PUBLIC_KEY, controller) ?? false;
  const guards: readonly { readonly name: string }[] = [
    ...((Reflect.getMetadata(GUARDS_METADATA, controller) as { name: string }[] | undefined) ?? []),
  ];
  return [
    RequestMethod[verb],
    full,
    resource,
    JSON.stringify(permissions),
    String(code),
    isPublic === true ? "public" : "staff",
    guards.map((guard) => guard.name).join("+") || "-",
  ].join(" | ");
}

/**
 * Les contrôleurs du fournil : ceux de la racine et des modules de métier
 * qu'elle importe. Les raccourcis, module à part importé par l'atelier, n'en
 * ont jamais fait partie.
 */
function productionControllers(): readonly Type[] {
  const modules = [
    ProductionModule,
    ...((Reflect.getMetadata("imports", ProductionModule) ?? []) as Type[]),
  ];
  return modules.flatMap((module) => (Reflect.getMetadata("controllers", module) ?? []) as Type[]);
}

function routeTable(): readonly string[] {
  const controllers = productionControllers();
  return controllers
    .flatMap((controller) =>
      Object.getOwnPropertyNames(controller.prototype).map((method) =>
        describeRoute(controller, method),
      ),
    )
    .filter((line): line is string => line !== null)
    .sort();
}

/**
 * La table des routes du fournil, telle que l'appelant la voit : verbe, chemin,
 * surface, droits exigés, statut, porte publique et gardes. Le découpage des
 * contrôleurs par métier (`documentation/fournil/architecture-contexte-production.md`,
 * « Les routes ») range les routes autrement ; il ne doit en changer aucune.
 */
describe("la table des routes du fournil", () => {
  it("reste celle d'avant le découpage des contrôleurs", () => {
    expect(routeTable()).toEqual(EXPECTED);
  });

  it("ne déclare aucune route deux fois", () => {
    const keys = routeTable().map((line) => line.split(" | ").slice(0, 2).join(" "));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

const EXPECTED: readonly string[] = [
  'DELETE | admin/production/containers/:sku | production_worksheet | ["production_settings:write"] | 204 | public | AdminAuthGuard+StaffAccessGuard',
  "DELETE | admin/production/settings/closed-days/:date | production_settings | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  "DELETE | admin/production/settings/dossier-recipients/:id | production_settings | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  "DELETE | admin/production/worksheet/:date/batches/:batchId | production_worksheet | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/document-specimens/atelier-sheet.pdf | b2b_accounting | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/document-specimens/day-dossier.pdf | b2b_accounting | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/document-specimens/production-count.pdf | b2b_accounting | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/document-specimens/production-simulation.pdf | b2b_accounting | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/production/batch/:date/compte-a-produire.pdf | production_plan | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/production/batch/:date/dossier.pdf | production_plan | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  'GET | admin/production/batch/:date/due-thresholds | production_plan | ["production_plan:read","production_worksheet:read"] | - | public | AdminAuthGuard+StaffAccessGuard',
  "GET | admin/production/batch/:date/resupplies | production_plan | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  'GET | admin/production/batch/:date/sheets/:reference.pdf | production_plan | ["production_worksheet:read"] | - | public | AdminAuthGuard+StaffAccessGuard',
  "GET | admin/production/batch/:date/status | production_plan | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  'GET | admin/production/containers | production_worksheet | ["production_worksheet:read","production_settings:read"] | - | public | AdminAuthGuard+StaffAccessGuard',
  "GET | admin/production/forecast | production_plan | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/production/quality-settings | lfc_order_settings | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/production/settings | production_settings | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/production/settings/dossier-recipients | production_settings | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/production/settings/dossier-recipients/staff-candidates | production_settings | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/production/simulation.pdf | production_workstations | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  'GET | admin/production/worksheet | production_worksheet | ["production_worksheet:read","production_plan:read"] | - | public | AdminAuthGuard+StaffAccessGuard',
  "GET | admin/production/worksheet/current | production_worksheet | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/production/workstations | production_workstations | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  'GET | admin/production/workstations/unplaced | production_workstations | ["production_plan:read"] | - | public | AdminAuthGuard+StaffAccessGuard',
  "GET | admin/supervision/preparation | b2b_supervision | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "GET | admin/supervision/quality | b2b_supervision | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  'GET | admin/supervision/quality/checks | b2b_supervision | ["b2b_supervision:write"] | - | public | AdminAuthGuard+StaffAccessGuard',
  'GET | admin/supervision/quality/checks/:checkId/photos/:position | b2b_supervision | ["b2b_supervision:write"] | - | public | AdminAuthGuard+StaffAccessGuard',
  "POST | admin/production/auto-close | - | [] | 200 | public | RecomputeGuard",
  'POST | admin/production/batch/:date/close | production_plan | ["production_count_stop:write"] | - | public | AdminAuthGuard+StaffAccessGuard',
  'POST | admin/production/batch/:date/reopen | production_plan | ["production_count_stop:write"] | - | public | AdminAuthGuard+StaffAccessGuard',
  "POST | admin/production/batch/:date/resupplies/:resupplyId/launch | production_resupply | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  "POST | admin/production/journal/sweep | - | [] | 200 | public | RecomputeGuard",
  "POST | admin/production/quality/sweep | - | [] | 200 | public | RecomputeGuard",
  "POST | admin/production/settings/closed-days | production_settings | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  "POST | admin/production/settings/dossier-recipients | production_settings | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "POST | admin/production/worksheet/:date/retake | production_worksheet | [] | - | public | AdminAuthGuard+StaffAccessGuard",
  "POST | admin/production/workstations | production_workstations | [] | 201 | public | AdminAuthGuard+StaffAccessGuard",
  "POST | admin/production/workstations/:id/archive | production_workstations | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  'POST | admin/production/workstations/grouping | production_workstations | ["production_plan:read","production_resupply:read"] | 200 | public | AdminAuthGuard+StaffAccessGuard',
  "POST | admin/supervision/quality/checks | b2b_supervision | [] | 201 | public | AdminAuthGuard+StaffAccessGuard",
  "POST | admin/supervision/quality/photos | b2b_supervision | [] | 201 | public | AdminAuthGuard+StaffAccessGuard",
  'PUT | admin/production/containers/:sku | production_worksheet | ["production_settings:write"] | 204 | public | AdminAuthGuard+StaffAccessGuard',
  "PUT | admin/production/quality-settings | lfc_order_settings | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  "PUT | admin/production/settings/display | production_settings | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  "PUT | admin/production/settings/tranches | production_settings | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  "PUT | admin/production/worksheet/:date/lines/:sku/batches/:batchId | production_worksheet | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  "PUT | admin/production/workstations/:id/name | production_workstations | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  "PUT | admin/production/workstations/order | production_workstations | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
  "PUT | admin/production/workstations/placements | production_workstations | [] | 204 | public | AdminAuthGuard+StaffAccessGuard",
];
