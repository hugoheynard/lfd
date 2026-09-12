# Comptabilité — qui encaisse, sous quelle identité, et par quel moyen

Tout ce qui touche à **l'entité qui émet** et au **prélèvement**. Le reste du
commerce — le compte client, la commande, le catalogue — vit dans
[`../b2b/`](../b2b/).

Ce dossier a été ouvert le **2026-09-10**, en sortant deux documents de `b2b/`.
Ils y étaient rangés par projet ; ils se lisent par sujet, et ce sujet-là a
gagné son propre contexte dans le code (`apps/lfd-api/src/b2b/accounting/`), son
propre droit staff (`b2b_accounting`) et son propre espace dans le back-office.

## Par où entrer

| Doc                                          | Quand l'ouvrir                                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`prelevement-sepa.md`](prelevement-sepa.md) | **Toujours.** C'est le document unique du sujet : l'objectif, l'état des lieux vérifié, le mandat, l'IBAN, le fichier `pain.008`, les objections ouvertes et le découpage. |

> **Fusion du 2026-09-12.** Trois documents se partageaient le prélèvement — le
> socle Stripe, la conception directe, et le format du fichier. Ils se
> contredisaient **volontairement** (le premier décrivait un système qu'on
> quitte), et chacun portait un bandeau pour le dire. Ça marche tant qu'on sait
> lequel lire en premier ; ce savoir-là ne se transmet pas. Les trois sont
> supprimés, leur contenu est dans le document unique, et les contradictions y
> sont racontées **au passé** plutôt que mises en vis-à-vis.

## Ce qu'il faut savoir avant d'y toucher

### L'entité juridique émettrice (`LegalEntity`) — en service

Code : `apps/lfd-api/src/b2b/accounting/`. Écran : Comptabilité › Entités
juridiques. Ouvert à l'écran le 2026-09-12, il fonctionne.

- **Trois ports sur une seule table**, et un seul est exporté. `CreditorReader`
  rend une **copie figée** ; exporter le port d'écriture laisserait un autre
  contexte charger l'agrégat et le muter depuis chez lui, et l'immuabilité de
  l'ICS ne serait plus tenue par personne.
- **L'ICS ne se remplace pas.** Chaque mandat signé le porte imprimé.
- **L'IBAN créancier entre par une seule route et ne ressort par aucune.** La
  vue n'en rend que quatre caractères. Un e2e le tient sur ce que le serveur
  **sérialise**, pas sur ce qu'un mapper prétend.
- Le **logo** est une donnée, pas une constante du produit : une seconde entité
  aurait le sien.
- La surface HTTP est en **trois contrôleurs** depuis le 2026-09-12 — le
  registre, ce qui décide de l'encaissement (ICS, compte, pré-notification), et
  ce qui sort en octets (logo, fiche de mandat). Même adresse de base.

### Le mandat SEPA — trois choses portent ce nom

| Ce qui existe                     | Où                                               | État                                                                                              |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Le mandat **Stripe**              | `src/b2b/payments/`                              | **gelé** — plus aucun n'est créé depuis le 2026-09-10                                             |
| La **fiche vierge** au modèle EPC | `accounting/domain/services/sepa-mandate-pdf.ts` | **livrée** — préremplie de notre bloc créancier, marquée EXEMPLE, donc **non signable à dessein** |
| Le mandat **direct**, nominatif   | —                                                | **à faire** : c'est lui qui débloque tout le reste                                                |

### La RUM — écrite, branchée à rien

🔴 `src/b2b/payments/domain/value-objects/rum.ts` est complet et testé, et
**aucun fichier du dépôt ne l'importe** _(vérifié le 2026-09-12)_. Né avec le
socle direct, puis le chantier a été mis en pause. **Ne pas le réécrire en
croyant qu'il manque.**

## Ce qui n'est pas ici

- **La facturation** — [`../b2b/architecture-facturation.md`](../b2b/architecture-facturation.md),
  dont le document unique périme la tranche 7 et la §6. Elle déménagera ici le
  jour où son code rejoindra `b2b/accounting/`, pas avant : un doc qu'on range
  d'après un plan décrit un dépôt qui n'existe pas.
- **Les alertes de compte client**, la **commande**, le **catalogue** — dans
  `../b2b/` et `../order/`.

## L'état d'esprit

Quatre **objections bloquantes** restent ouvertes, et le document unique dit
laquelle bloque quelle tranche. **Aucune ne touche l'entité juridique** — c'est
pour ça que la reprise a commencé par elle, et pas parce que c'était le plus
facile.

Et une question qui n'est pas technique : **le calcul des frais**, motif
d'origine de tout le chantier, n'a jamais été chiffré contre le coût d'un
émetteur direct. Une reprise devrait commencer par là.
