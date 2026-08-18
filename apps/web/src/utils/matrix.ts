import type { RouterOutputs } from "~/utils/api";

type Board = NonNullable<RouterOutputs["board"]["byId"]>;
type Card = Board["lists"][number]["cards"][number];

/**
 * A label with this name is a flag, not an outcome row. Matched loosely on
 * purpose: someone typing "blocked" by hand should not silently gain an extra
 * row and lose the blocked marker at the same time.
 */
const BLOCKED_LABEL = "blocked";

export const isBlockedLabel = (name: string) =>
  name.trim().toLowerCase() === BLOCKED_LABEL;

export const isBlocked = (card: Card) =>
  card.labels.some((l) => isBlockedLabel(l.name));

export interface MatrixCard {
  card: Card;
  stage: string;
  isDone: boolean;
  blocked: boolean;
}

export interface Matrix {
  /** Rows. Every label except the Blocked flag. */
  outcomes: Board["labels"];
  /** Columns. Only people who actually have a card here. */
  people: Board["workspace"]["members"];
  cellOf: (labelPublicId: string, memberPublicId: string) => MatrixCard[];
  progressOf: (labelPublicId: string) => { done: number; total: number };
  /** Cards that belong in no cell, so the UI can say so rather than drop them. */
  hidden: number;
  totals: { all: number; done: number };
}

/**
 * Pivots a board into outcomes × people.
 *
 * Both axes are independent many-to-many relations off the same card — labels
 * for the outcome, assigned members for the person — so a cell is just their
 * intersection. The card's list is its stage, which becomes a colour rather
 * than a third axis.
 *
 * "Done" is the last list: Kan has no isDone flag, so order is the only signal.
 */
export function buildMatrix(board: Board): Matrix {
  const doneListId = board.lists.length
    ? board.lists[board.lists.length - 1]?.publicId
    : undefined;

  const rows: MatrixCard[] = board.lists.flatMap((list) =>
    list.cards.map((card) => ({
      card,
      stage: list.name,
      isDone: list.publicId === doneListId,
      blocked: isBlocked(card),
    })),
  );

  const outcomes = board.labels.filter((l) => !isBlockedLabel(l.name));

  const assigned = new Set(
    rows.flatMap(({ card }) => card.members.map((m) => m.publicId)),
  );
  const people = board.workspace.members.filter(
    (m) => m.user && assigned.has(m.publicId),
  );

  const cellOf = (labelPublicId: string, memberPublicId: string) =>
    rows.filter(
      ({ card }) =>
        card.labels.some((l) => l.publicId === labelPublicId) &&
        card.members.some((m) => m.publicId === memberPublicId),
    );

  const progressOf = (labelPublicId: string) => {
    const forLabel = rows.filter(({ card }) =>
      card.labels.some((l) => l.publicId === labelPublicId),
    );
    return {
      done: forLabel.filter((r) => r.isDone).length,
      total: forLabel.length,
    };
  };

  const outcomeIds = new Set(outcomes.map((o) => o.publicId));
  const hidden = rows.filter(
    ({ card }) =>
      !card.labels.some((l) => outcomeIds.has(l.publicId)) ||
      card.members.length === 0,
  ).length;

  return {
    outcomes,
    people,
    cellOf,
    progressOf,
    hidden,
    totals: { all: rows.length, done: rows.filter((r) => r.isDone).length },
  };
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** Colours for the person columns, in order. */
export const PERSON_COLOURS = [
  "#2563EB",
  "#7C3AED",
  "#0F766E",
  "#C2410C",
  "#BE185D",
  "#A16207",
];
