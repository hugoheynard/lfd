# Comptabilité — qui encaisse, sous quelle identité, et par quel moyen

Tout ce qui touche à **l'entité qui émet** et au **prélèvement**. Le reste du
commerce — le compte client, la commande, le catalogue — vit dans
[`../b2b/`](../b2b/).

Ce dossier a été ouvert le **2026-09-10**, en sortant deux documents de `b2b/`.
Ils y étaient rangés par projet ; ils se lisent par sujet, et ce sujet-là a
gagné son propre contexte dans le code (`apps/lfd-api/src/b2b/accounting/`), son
propre droit staff (`b2b_accounting`) et son propre espace dans le back-office.

## Par où entrer

| Doc                                                                                  | Quand l'ouvrir                                                                                                        |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [`architecture-prelevement-sepa-direct.md`](architecture-prelevement-sepa-direct.md) | **Le document de référence.** Ce qu'on construit : notre ICS, la RUM frappée chez nous, le lot `pain.008`, la reprise |
| [`architecture-prelevement-sepa.md`](architecture-prelevement-sepa.md)               | Ce qui **tourne** et qu'on quitte : les mandats Stripe. À lire pour comprendre l'existant, pas pour l'étendre         |

⚠️ **Les deux se contredisent, et c'est voulu.** Le second décrit un système
qu'on abandonne ; sa décision B — « Stripe frappe la référence » — a été
délibérément renversée le 2026-09-10. Chacun porte un bandeau qui le dit. Ne pas
« harmoniser ».

## Où trouver quoi

### L'entité juridique émettrice (`LegalEntity`)

Sa conception est la **tranche 1** du document de référence, et la section
« T1, livrée le 2026-09-10 — ce qu'elle contient vraiment » dit ce qui a
réellement été construit, y compris ce qui a été livré en plus du périmètre
annoncé.

Elle est **en service**. Le code : `apps/lfd-api/src/b2b/accounting/`, l'écran :
Comptabilité › Entités juridiques.

Ce qu'il faut savoir avant d'y toucher :

- **Trois ports sur une seule table**, et un seul est exporté. `CreditorReader`
  rend une **copie figée** ; exporter le port d'écriture laisserait un autre
  contexte charger l'agrégat et le muter depuis chez lui, et l'immuabilité de
  l'ICS ne serait plus tenue par personne.
- **L'ICS ne se remplace pas.** Chaque mandat signé le porte imprimé.
- **L'IBAN créancier entre par une seule route et ne ressort par aucune.** La
  vue n'en rend que quatre caractères. Un e2e le tient sur ce que le serveur
  sérialise, pas sur ce qu'un mapper prétend.
- Le **logo** de l'entité est une donnée, pas une constante du produit : une
  seconde entité aurait le sien.

### Le mandat SEPA

Deux choses portent ce nom, et les confondre coûte cher :

| Ce qui existe                     | Où                                                       | État                                                                                |
| --------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Le mandat **Stripe**              | `src/b2b/payments/`                                      | **en service** — enregistre, prouve, révoque. La référence vient d'EUX              |
| La **fiche vierge** au modèle EPC | `src/b2b/accounting/domain/services/sepa-mandate-pdf.ts` | **livrée** le 2026-09-10 — préremplie de notre bloc créancier, sans débiteur ni RUM |
| Le mandat **direct**, nominatif   | —                                                        | **tranche 2, bloquée** par l'objection 2 de la §0 ter                               |

La fiche vierge est un **fragment de la tranche 3, livré en avance sur la 2** :
la section « T3, fragment livré le 2026-09-10 » du document de référence dit
pourquoi, et ce que T3 doit encore livrer.

### La RUM

🔴 **Le value object existe déjà et n'est branché à rien** —
`src/b2b/payments/domain/value-objects/rum.ts`, complet, neuf tests, aucun
consommateur en production. Il est né avec le socle du prélèvement direct, puis
le chantier a été mis en pause. Le document de référence l'inventorie comme
orphelin ; ne pas le réécrire en croyant qu'il manque.

Il dérive la référence de l'identifiant du mandat (`LFC` + ULID, 29 caractères
sous la borne EPC de 35), ce qui rend la collision **impossible par
construction** au lieu de surveillée — et permet de retrouver un mandat depuis
sa seule référence, ce qui compte le jour où un client appelle avec pour toute
information la ligne de son relevé.

⚠️ Cette garantie ne couvre que la RUM **que nous frappons**. `Rum.create` relit
aussi des références venues d'un import ou d'un fichier de retour, et une reprise
de portefeuille en apporte de tiers, qui peuvent se heurter entre elles. C'est là
que l'index `UNIQUE (creditor_id, rum)` prévu en tranche 2 gagne sa place — pas
sur le chemin de la frappe. _(vérifié le 2026-09-10)_

## Ce qui n'est pas ici

- **La facturation** — [`../b2b/architecture-facturation.md`](../b2b/architecture-facturation.md).
  Elle est le sujet voisin, ses tranches 4 à 6 sont ordonnancées dans le document
  de référence, et son code est appelé à rejoindre `b2b/accounting/`. Elle
  déménagera le jour où ce sera fait, pas avant : un doc qu'on range d'après un
  plan décrit un dépôt qui n'existe pas.
- **Les alertes de compte client**, la **commande**, le **catalogue** — dans
  `../b2b/` et `../order/`.

## L'état d'esprit

Quatre **objections bloquantes** sont ouvertes sur le document de référence, et
la §0 ter dit laquelle bloque quelle tranche. Aucune ne touche la tranche 1 —
c'est pour ça que la reprise a commencé par l'entité juridique, et pas parce que
c'était le plus facile.
