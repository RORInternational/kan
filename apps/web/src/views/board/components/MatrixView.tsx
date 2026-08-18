import { t } from "@lingui/core/macro";

import type { RouterOutputs } from "~/utils/api";
import { buildMatrix, initials, PERSON_COLOURS } from "~/utils/matrix";

type Board = NonNullable<RouterOutputs["board"]["byId"]>;

const formatDue = (due: Date) =>
  due.toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * Read-only pivot of the board: outcomes down the side, people across the top.
 *
 * There is deliberately no drag and drop. A cell is outcome × person, so moving
 * a card between cells would mean reassigning it, not advancing it — the stage
 * lives in the card's colour instead. Editing happens by opening the card or
 * switching back to the board.
 */
export default function MatrixView({
  board,
  onOpenCard,
}: {
  board: Board;
  onOpenCard?: (cardPublicId: string) => void;
}) {
  const { outcomes, people, cellOf, progressOf, hidden } = buildMatrix(board);

  if (!outcomes.length || !people.length) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-8 pb-[150px] text-center">
        <p className="mb-2 text-[14px] font-bold text-light-1000 dark:text-dark-950">
          {t`Nothing to pivot yet`}
        </p>
        <p className="max-w-md text-[14px] text-light-900 dark:text-dark-900">
          {!outcomes.length
            ? t`This view groups cards by label. Add a label for each outcome you want as a row.`
            : t`This view splits cards by assignee. Assign a member to a card to give it a column.`}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-[2rem] pb-8">
      <div
        className="grid min-w-[52rem] overflow-hidden rounded-md border border-light-300 bg-light-50 dark:border-dark-300 dark:bg-dark-50"
        style={{
          gridTemplateColumns: `minmax(13rem, 1.1fr) repeat(${people.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="border-b border-light-400 bg-light-100 px-4 py-3 dark:border-dark-400 dark:bg-dark-100">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-light-900 dark:text-dark-900">
            {t`Key outcomes`}
          </span>
        </div>
        {people.map((p, i) => (
          <div
            key={p.publicId}
            className="flex items-center gap-2 border-b border-l border-light-400 border-l-light-300 bg-light-100 px-4 py-3 dark:border-dark-400 dark:border-l-dark-300 dark:bg-dark-100"
          >
            <span
              className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: PERSON_COLOURS[i % PERSON_COLOURS.length] }}
            >
              {initials(p.user?.name ?? p.email)}
            </span>
            <span className="truncate text-[14px] font-bold text-light-1000 dark:text-dark-1000">
              {p.user?.name ?? p.email}
            </span>
          </div>
        ))}

        {outcomes.map((outcome, rowIndex) => {
          const { done, total } = progressOf(outcome.publicId);
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <MatrixRow
              key={outcome.publicId}
              outcome={outcome}
              cardPrefix={board.workspace.cardPrefix}
              rowIndex={rowIndex}
              people={people}
              cellOf={cellOf}
              done={done}
              total={total}
              pct={pct}
              onOpenCard={onOpenCard}
            />
          );
        })}

        {hidden > 0 && (
          <div
            className="border-t border-light-300 bg-light-100 px-4 py-2 text-[12px] font-semibold text-light-900 dark:border-dark-300 dark:bg-dark-100 dark:text-dark-900"
            style={{ gridColumn: "1 / -1" }}
          >
            {t`${hidden} card(s) not shown — each needs one outcome label and an assignee`}
          </div>
        )}
      </div>
    </div>
  );
}

function MatrixRow({
  outcome,
  cardPrefix,
  rowIndex,
  people,
  cellOf,
  done,
  total,
  pct,
  onOpenCard,
}: {
  outcome: Board["labels"][number];
  cardPrefix: string;
  rowIndex: number;
  people: Board["workspace"]["members"];
  cellOf: ReturnType<typeof buildMatrix>["cellOf"];
  done: number;
  total: number;
  pct: number;
  onOpenCard?: (cardPublicId: string) => void;
}) {
  const accent = outcome.colourCode ?? "#0d9488";

  return (
    <>
      <div className="flex flex-col justify-center border-b border-light-300 bg-light-100 px-4 py-3 dark:border-dark-300 dark:bg-dark-100">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-light-800 dark:text-dark-800">
          {t`Outcome`} {String(rowIndex + 1).padStart(2, "0")}
        </span>
        <span className="mt-0.5 text-[14px] font-bold leading-snug text-light-1000 dark:text-dark-1000">
          {outcome.name}
        </span>
        <div className="mt-2 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-light-400 dark:bg-dark-400">
            <span
              className="block h-full rounded-full"
              style={{ width: `${pct}%`, background: accent }}
            />
          </span>
          <span className="text-[12px] font-bold tabular-nums text-light-950 dark:text-dark-950">
            {pct}%
          </span>
        </div>
        <span className="mt-0.5 text-[11px] font-medium text-light-800 dark:text-dark-800">
          {done} / {total} {t`done`}
        </span>
      </div>

      {people.map((p) => {
        const items = cellOf(outcome.publicId, p.publicId);
        return (
          <div
            key={p.publicId}
            className="flex flex-col gap-1.5 border-b border-l border-light-300 p-1.5 dark:border-dark-300"
          >
            {items.map(({ card, stage, isDone, blocked }) => (
              <button
                key={card.publicId}
                type="button"
                onClick={() => onOpenCard?.(card.publicId)}
                className={`rounded border px-2 py-1.5 text-left transition-colors ${
                  blocked
                    ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30"
                    : isDone
                      ? "border-light-300 bg-light-100 dark:border-dark-300 dark:bg-dark-100"
                      : stage.toLowerCase().includes("working")
                        ? "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30"
                        : "border-light-300 bg-light-50 dark:border-dark-300 dark:bg-dark-50"
                } ${onOpenCard ? "hover:border-light-500 dark:hover:border-dark-500" : ""}`}
              >
                <span className="flex items-start gap-1.5">
                  <span
                    className={`mt-1 h-1.5 w-1.5 flex-none rounded-full ${
                      blocked
                        ? "bg-red-500"
                        : isDone
                          ? "bg-emerald-500"
                          : stage.toLowerCase().includes("working")
                            ? "bg-blue-500"
                            : "bg-amber-500"
                    }`}
                  />
                  <span className="min-w-0">
                    {card.cardNumber !== null && (
                      <span className="block text-[10px] font-bold tracking-wide text-light-800 dark:text-dark-800">
                        {cardPrefix}-{card.cardNumber}
                      </span>
                    )}
                    <span
                      className={`block text-[13px] font-semibold leading-snug ${
                        isDone
                          ? "text-light-900 line-through dark:text-dark-900"
                          : "text-light-1000 dark:text-dark-1000"
                      }`}
                    >
                      {card.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium text-light-800 dark:text-dark-800">
                      {blocked ? `${t`Blocked`} · ${stage}` : stage}
                      {card.dueDate && ` · ${formatDue(new Date(card.dueDate))}`}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}
