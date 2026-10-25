import type { ActivationPiece } from '@lfd/contracts';

import type { AdminCompany } from '../admin-company';

/** Qui entre dans la vue : les inscrits seuls (défaut), ou toutes les déclarations. */
export type PipelineScope = 'self' | 'all';

/** Une marche de l'entonnoir — la forme que `funnelOption` sait dessiner. */
export interface PipelineStep {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

/** Une pièce d'une ligne : son libellé, et si elle est là. */
export interface PieceMark {
  readonly piece: ActivationPiece;
  readonly label: string;
  readonly done: boolean;
}

/** Une ligne du tableau : un dossier en attente, ses pièces, son âge. */
export interface PipelineRow {
  readonly company: AdminCompany;
  /** Les pièces que l'activation exige — le « x/3 ». */
  readonly pieces: readonly PieceMark[];
  readonly reached: number;
  /** L'adresse de livraison, montrée à part : l'activation ne l'exige pas. */
  readonly delivery: PieceMark;
  /** Jours entiers depuis la déclaration — « bloqué depuis ». */
  readonly stalledDays: number;
}

/**
 * Les pièces que l'activation EXIGE, dans l'ordre et avec les mots de l'ancien
 * étage Activation. La livraison n'en est plus (`activationGate`, côté compte,
 * ne l'exige pas) : la compter ferait lire « 3/4 » à un dossier activable.
 * Hugo, 2026-10-25 : « sur 3, la livraison à part ».
 */
export const PIECES: readonly { readonly piece: ActivationPiece; readonly label: string }[] = [
  { piece: 'vat', label: 'TVA' },
  { piece: 'kbis', label: 'KBIS' },
  { piece: 'billing', label: 'Facturation' },
];

/** L'adresse de livraison, une information sur la ligne — pas une pièce du compte. */
export const DELIVERY_PIECE = { piece: 'delivery', label: 'Livraison' } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Vrai si la société entre dans la vue. Un `declaredVia` à `null` (canal jamais
 * su) n'entre que dans « Tous » : le compter comme inscrit seul l'inventerait.
 */
export function inScope(company: AdminCompany, scope: PipelineScope): boolean {
  return scope === 'all' || company.declaredVia === 'self';
}

/**
 * L'entonnoir : déclarées → chaque pièce → activées, compté sur TOUTES les
 * sociétés du périmètre, actives comprises — sans quoi la dernière marche
 * serait toujours vide. Les pièces ne sont pas séquentielles (un KBIS peut
 * précéder la TVA) : chaque marche compte les dossiers qui ont CETTE pièce.
 */
export function pipelineFunnel(companies: readonly AdminCompany[]): PipelineStep[] {
  return [
    { key: 'declared', label: 'Déclarées', count: companies.length },
    ...PIECES.map(({ piece, label }) => ({
      key: piece,
      label,
      count: companies.filter((company) => company.piecesReached.includes(piece)).length,
    })),
    {
      key: 'activated',
      label: 'Activées',
      count: companies.filter((company) => company.activatedAt !== null).length,
    },
  ];
}

/**
 * Les dossiers en attente, le plus anciennement bloqué en tête — l'ordre de
 * l'ancien étage Activation, qui est celui des appels à passer.
 */
export function pendingRows(companies: readonly AdminCompany[], now: Date): PipelineRow[] {
  return companies
    .filter((company) => company.status === 'pending')
    .map((company) => ({
      company,
      pieces: PIECES.map(({ piece, label }) => ({
        piece,
        label,
        done: company.piecesReached.includes(piece),
      })),
      reached: PIECES.filter(({ piece }) => company.piecesReached.includes(piece)).length,
      delivery: { ...DELIVERY_PIECE, done: company.piecesReached.includes(DELIVERY_PIECE.piece) },
      stalledDays: Math.max(
        0,
        Math.floor((now.getTime() - new Date(company.createdAt).getTime()) / DAY_MS),
      ),
    }))
    .sort((a, b) => b.stalledDays - a.stalledDays);
}
