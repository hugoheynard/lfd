# Arbitrages pris en l'absence d'Hugo

> Ouvert le 2026-10-08. Hugo : « je préfère que tu fasses tout et tiennes une
> liste de questions que tu auras arbitrées pendant mon absence plutôt que tu
> t'arrêtes ». Chaque ligne dit la question, ce qui a été choisi, pourquoi, et
> ce qu'il faudrait défaire pour revenir dessus. **Rien n'est poussé** tant
> qu'Hugo n'a pas relu cette liste (et confirmé les clés Stripe).

| #   | Chantier | Question                                                                            | Arbitrage                                                                                                                                                                  | Pourquoi                                                                                                                                                 | Pour revenir dessus                                                      |
| --- | -------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A1  | E4b      | Une commande passée entre 23h55 et minuit le dernier jour : quel mois ?             | La facture du mois suivant (comme le faisait 22h, sur 5 minutes au lieu de 2 h).                                                                                           | Émettre exactement à minuit rend la facture datée du mois suivant ; 5 minutes est la plus petite fenêtre que le cron tient sans ambiguïté d'heure d'été. | Avancer l'heure d'émission (réglage).                                    |
| A2  | E3b      | Quelle police embarquer dans le PDF/A (PDF/A interdit les polices non embarquées) ? | **Source Sans 3**, regular et bold (Adobe, licence OFL 1.1, 431 ko + 428 ko), téléchargée depuis `github.com/adobe-fonts/source-sans`, licence jointe.                     | Lisible, couvre le français, l'italien et « € », licence libre qui permet l'embarquement. Les polices déjà présentes (KaTeX) sont mathématiques.         | Remplacer les deux fichiers TTF.                                         |
| A3  | E3b      | Valider le XML contre le Schematron EN 16931 (`saxon-js`) ?                         | **Pas dans ce lot** : `pnpm add` modifie `node_modules` sous ta pile de dev en marche. Le contrôle arithmétique maison (`facturXArithmeticViolations`) reste le garde-fou. | Ne pas casser ta pile en ton absence.                                                                                                                    | Arrêter la pile, `pnpm add -D saxon-js xslt3`, brancher le test (≈ 1 h). |

## La file des chantiers (ordre de passage)

Un lot à la fois, chacun vérifié puis commité avant le suivant.

1. **E4b** — émission à 23h55, une facture par mandat.
2. **E3b** — le PDF/A-3 Factur-X de la facture émise (pdfkit déjà là, police embarquée).
3. **F5** — le bon d'un pro au compte en HT (la facture émise existe).
4. **PA2, le trou** — envoyer les annulations même quand la préparation ne produit aucun lot.
5. **Suites d'E6** — « Mes factures » d'un site, renvoi de l'e-mail, e-mail en/it, page maquette `mes-factures/`.
6. **E5** — la facture d'une commande payée par carte, après un plan des remboursements (contredit par `vitruve`).
7. **Export CSV des mandats** pour le portail de la banque (colonnes A–H).
8. **PA5** — les retours bancaires (`pain.002`, `camt.054`), sur la norme.
9. **Fidélité** — ce qui ne dépend pas du cabinet.
10. **Docs** — les plans bâtis deviennent des docs d'état (blocage et liens de paiement, mentions du mandat, restes du mandat, simulateur, le prélèvement suit la facture, bons et facture).
