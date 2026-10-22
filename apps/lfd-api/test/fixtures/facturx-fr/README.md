# Artefacts officiels : Factur-X EN 16931 et CIUS-FR

Ces fichiers sont recopiés **tels quels**, sans aucune modification, depuis la
publication FNFE-MPE. Les specs
`src/b2b/accounting/domain/services/__tests__/facturx-fr-conformance.spec.ts`
s'en servent pour valider chaque forme de pièce que l'émission produit
(`facturx-samples.ts`). Doc : `documentation/comptabilite/facturation/facture-emise.md`.

## Provenance

| Champ          | Valeur                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Paquet         | `2026_09_04_FNFE_SCHEMATRONS_FR_CTC_V1.4.0.04.zip`                                               |
| URL            | https://fnfe-mpe.org/wp-content/uploads/2026/09/2026_09_04_FNFE_SCHEMATRONS_FR_CTC_V1.4.0.04.zip |
| Lien depuis    | https://fnfe-mpe.org/factur-x/                                                                   |
| SHA-256 du zip | `9fddfbbb081ec969374dcefd24615fb1d736fdd974155890fc24a413afd0c01e`                               |
| Téléchargé le  | 2026-10-22                                                                                       |
| Sous-dossier   | `Factur-X_1.09.2.fixFR04/EN16931/`                                                               |
| Licence        | EUPL (en-tête des Schematrons BR-FR : « Licensed under European Union Public Licence »)          |

| Fichier                                           | Ce que c'est                                                                   | SHA-256 (préfixe) |
| ------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------- |
| `xsd/Factur-X_EN16931.xsd` (+ 3 schémas importés) | XSD Factur-X **1.09.2**, profil EN 16931                                       | `cb98b34e`        |
| `schematron/FACTUR-X_EN16931.xslt`                | Schematron Factur-X 1.09.2 EN 16931, compilé XSLT par la FNFE                  | `67f03050`        |
| `schematron/FACTUR-X_EN16931_codedb.xml`          | ses listes de codes, lues par `document()`                                     | `70339a41`        |
| `schematron/BR-FR-Flux2-Schematron-CII.xslt`      | Schematron **BR-FR Flux 2 v1.4.0.04** (CIUS-FR, XP Z12-012 v1.4), mode `FATAL` | `02c9b979`        |

L'en-tête du Schematron BR-FR dit : mode « FATAL » applicable en émission à
compter du 1er octobre 2026. La variante `_WARNING` du paquet n'est donc pas
recopiée.

## Ce qui n'a PAS pu être récupéré (2026-10-22)

- **La spécification Factur-X 1.09.2** (dossier complet FR/EN) : la page de la
  FNFE-MPE ne la distribue que contre une adresse e-mail, qui n'a pas été
  fournie. Les XSD et Schematrons ci-dessus viennent du paquet Schematrons,
  en accès direct. Conséquence : les valeurs XMP `fx:Version` /
  `fx:ConformanceLevel` restent non vérifiées.
- **La norme XP Z12-012 sur impots.gouv.fr** : le site était en maintenance.
  Ses annexes A et B v1.4 ont été lues depuis la FNFE-MPE
  (`FR_and_ENG_XP_Z12-012_Annexes_A_et_B_EXEMPLES_V1.4.zip`, même page), mais
  ne sont pas commitées : aucun test ne les exécute.

## Mettre à jour

Déposer les nouveaux fichiers sous les mêmes noms et mettre ce tableau à jour.
Les SEF compilés vivent dans `node_modules/.cache/facturx-fr-*`, nommés par
l'empreinte de l'XSLT : une nouvelle version se recompile d'elle-même.
Le XSD passe par libxml2 en WebAssembly (`xmllint-wasm`, `xsd-validation.ts`) : rien à installer.
