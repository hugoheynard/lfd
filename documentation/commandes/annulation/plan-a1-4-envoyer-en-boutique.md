# Plan A1.4 — envoyer en boutique le pain rendu par une annulation

> **Doc-first, 2026-10-25. Rien n'est bâti.** Lot A1.4 du
> [plan A1](plan-a1-retirer-une-commande-inscrite.md) (§ 4, Q4 : « un geste
> pour le vendre », Hugo le 2026-10-25). Rien ne s'encaisse par notre
> système : la boutique vend à sa propre caisse. Ni argent, ni migration, ni
> frontière : pas de `vitruve` d'office ; affirmations rouvertes le
> 2026-10-25 dans [`../../reassort-boutiques/README.md`](../../reassort-boutiques/README.md).

## 0. Ce qui existe

- **Le fournil envoie déjà ses propres réassorts** (lot R1d) :
  `SiteResupply.sentByBakehouse`, origine `bakehouse`, créé **et** envoyé
  d'un geste, visée `tomorrow` ou `asap` (« au plus tôt », journée =
  aujourd'hui, sans heure limite). Route `POST admin/bakehouse-resupplies/sites/:siteId`
  (`{ target, lines }`) sous `production_resupply:write` ; carte « Envoyer un
  réassort » au fournil (`production/reassorts-a-produire/bakehouse-resupply-card/`).
- **Il suit le circuit des réassorts** : plan, colisage, transfert du point,
  réception au comptoir (« Envoyé par le fournil »).
- **A1.3** publie `packing.sheet_withdrawn` avec les lignes rendues à la
  réserve, et le poste les montre.

## 1. Le geste

« **Envoyer en boutique** », à la **Supervision**, sur la ligne « rendu par
une annulation » — **un geste de superviseur** (Hugo, 2026-10-25) : choisir
où part le pain, c'est arbitrer entre les boutiques, pas coliser. Le poste de
colisage montre ce qui a été rendu, sans le geste :

1. ouvre la composition d'un réassort du fournil **pré-remplie** : visée
   « au plus tôt », lignes = ce que l'annulation a rendu ;
2. l'équipe choisit la boutique, ajuste les quantités (jamais au-delà de ce
   qui a été rendu et reste libre en réserve), envoie ;
3. **le reste est le réassort existant**, sans rien de neuf : colisage,
   transfert, réception, vente à la caisse de la boutique.

Le geste exige `production_resupply:write`, comme la carte du fournil ; il
s'accorde au superviseur à l'écran des rôles (aucune migration n'accorde de
droit).

## 2. À vérifier au bâti (ouvrir, pas supposer)

- qu'un réassort `asap` envoyé **après l'arrêt** entre bien au plan du jour
  et **réserve** les pièces libres de la réserve (lots R4a « lancer au plus
  tôt » et R4b, réservations) — sinon le pain rendu et le réassort vivraient
  côte à côte sans se rencontrer ;
- que la composition du fournil accepte d'être ouverte pré-remplie
  (composant réutilisé, pas recopié) ;
- la trace : le réassort mentionne-t-il qu'il vient d'une annulation ? Si la
  charge du réassort ne le permet pas sans migration, le journal suffit
  (`packing.sheet_withdrawn` puis l'envoi, même auteur, même minute).

## 3. Tests

Unitaire : la pré-composition à partir des lignes rendues, bornée par la
réserve libre. E2E : annulation après l'arrêt → envoi en boutique → réassort
`bakehouse` `asap` au plan du jour, pièces réservées ; sans le droit, 403.
