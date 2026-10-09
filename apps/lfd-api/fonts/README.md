# Les polices de la facture

| Fichier                   | Ce que c'est                                                    |
| ------------------------- | --------------------------------------------------------------- |
| `SourceSans3-Regular.ttf` | Source Sans 3, graisse normale (Adobe)                          |
| `SourceSans3-Bold.ttf`    | Source Sans 3, graisse grasse (Adobe)                           |
| `OFL-LICENSE.md`          | La licence SIL Open Font License 1.1, qui permet de l'embarquer |

Elles sont **embarquées** dans chaque PDF/A-3 Factur-X de facture et d'avoir
(plan [`../../../documentation/comptabilite/facturation/facture-emise.md`](../../../documentation/comptabilite/facturation/facture-emise.md)) :
PDF/A interdit une police non embarquée, donc les polices standard de
`pdfkit` (Helvetica…) en sont exclues.

## 🔴 Ce dossier EST lu à l'exécution

Au contraire de `../assets/`. `nest build` ne le copie pas dans `dist/` ; il
est lu à côté, depuis le dossier de l'app que `pnpm deploy` emporte en entier
(aucun champ `files`, tenu par `lint:deployed-app-files`) et que
`.dockerignore` n'exclut pas. L'adaptateur
(`src/b2b/accounting/infrastructure/disk-invoice-font-source.ts`) remonte de
quatre niveaux depuis son propre fichier, ce qui tombe ici depuis `src/` comme
depuis `dist/`. Sa spec lit les fichiers par le même chemin.

Un fichier renommé ou retiré ici : plus aucun PDF ne se rend, chaque échec
est journalisé (`invoice.document_render_failed`), et l'e-mail « Votre
facture » part sans pièce jointe.

⚠️ Changer de police change les octets de tout rendu suivant. Une pièce déjà
rendue ne l'est jamais deux fois ; mais une pièce dont le rendu a été
interrompu entre le dépôt et l'attache serait reprise avec d'autres octets, et
refusée (`InvoiceDocumentConflictError`) plutôt qu'écrasée.
