const base = require("./jest.base.cjs");

/** @type {import('jest').Config} */
// LES E2E — celles qui frappent un vrai Postgres et un vrai stockage objet.
module.exports = {
  ...base,
  displayName: "lfd-api:e2e",
  testMatch: ["<rootDir>/test/**/?(*.)+(e2e-spec).ts"],
  // 🔴 CE QUI PROTÈGE L'ISOLATION N'EST PLUS LE WORKER UNIQUE, C'EST LA BASE.
  //
  // Historiquement `maxWorkers: 1`, pour la raison ci-dessous — elle reste vraie
  // mot pour mot, seule la réponse a changé. Chaque worker a désormais SA base
  // (`lfc_b2b_test_w<n>`) et SON bucket, posés par `test/setup-env.ts`. Deux
  // suites ne peuvent plus se voir, donc elles peuvent tourner ensemble.
  //
  // ⚠️ Ne pas remettre `maxWorkers: 1` en croyant réparer un flake : ce serait
  // masquer une fuite d'isolation au lieu de la lire. Un test qui échoue en
  // parallèle et passe seul accuse un état PARTAGÉ qu'on a manqué — cherchez-le.
  //
  // La panne d'origine, pour mémoire :
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
  // Le nombre de workers vient de l'environnement, comme les bases : c'est la
  // MÊME source (`E2E_WORKERS`, lue dans `test/setup-env.ts`). Le réglage doit
  // rester unique — un jour où le nombre de workers dépasserait le nombre de
  // bases, deux workers en partageraient une, et on retomberait exactement dans
  // la panne décrite ci-dessus.
  // ⚠️ `E2E_WORKERS=1` fait tenir les 51 suites dans UN process, et le plafond
  // de tas du script `test:e2e` (2048 Mo) est dimensionné pour le mode
  // parallèle, où chaque worker a le sien. Un run à un seul worker doit donc
  // remonter ce plafond — c'est ce que fait `e2e:rebalance`. Sans ça, Node
  // meurt d'un « heap out of memory » qui n'accuse aucune suite en particulier.
  maxWorkers: Number(process.env.E2E_WORKERS ?? "4"),
};
