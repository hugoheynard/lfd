import type { SuiteAppEntry } from "./suite-app";

/**
 * Le **registre** de la suite : quelles apps composent l'outillage interne, dans
 * l'ordre du switcher. Ajouter une app = une ligne ici + son URL dans
 * `suite-config(.dev).ts`. L'app tourne telle quelle en iframe.
 *
 * Le back-office est le **seul locataire** depuis que le référentiel y a été
 * greffé : il fut une app à part, ouverte ici en iframe, il est désormais un de
 * ses modules. Une tuile de moins au switcher, une porte de moins à tenir.
 *
 * Le shell est conservé malgré ce locataire unique, et pour une autre raison que
 * la fédération : accueillir des sujets à venir, hors boulangerie. C'est une
 * porte d'entrée de plateforme, pas un lanceur devenu inutile — cf.
 * `documentation/suite/architecture-topologie-apps.md`.
 */
export const SUITE_APPS: readonly SuiteAppEntry[] = [
  {
    id: "b2b-admin",
    title: "B2B admin",
    icon: "company",
    routePath: "b2b-admin",
    requiredPermission: "app:b2b-admin",
  },
];
