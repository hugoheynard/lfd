const base = require("./jest.base.cjs");

/** @type {import('jest').Config} */
// LES E2E — celles qui frappent un vrai Postgres et un vrai stockage objet.
module.exports = {
  ...base,
  displayName: "lfd-api:e2e",
  testMatch: ["<rootDir>/test/**/?(*.)+(e2e-spec).ts"],
  // 🔴 UN SEUL worker, et ce n'est pas une préférence de vitesse.
  //
  // Toutes les suites e2e partagent LA MÊME base jetable (`lfc_b2b_test`) et la
  // tronquent entre les cas. Deux suites en parallèle s'effacent donc leurs
  // fixtures l'une l'autre : un staff semé par l'une n'existe plus quand l'autre
  // l'interroge, et le mur d'accès refuse — un 403 parfaitement légitime, sur un
  // utilisateur qui aurait dû exister. Le symptôme est spectaculaire (des
  // dizaines d'échecs, quelques rescapés) et ne ressemble pas à sa cause.
  //
  // Posé ICI et pas seulement en `--runInBand` dans le script npm : un clic
  // droit « Run » depuis l'IDE ne passe pas par le script, et retombait donc
  // dans le piège.
  maxWorkers: 1,
};
