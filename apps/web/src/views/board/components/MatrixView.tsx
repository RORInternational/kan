import { t } from "@lingui/core/macro";

import type { RouterOutputs } from "~/utils/api";
import {
  buildMatrix,
  checklistProgress,
  initials,
  isOverdue,
  nextStep,
  PERSON_COLOURS,
} from "~/utils/matrix";

type Board = NonNullable<RouterOutputs["board"]["byId"]>;

const formatDue = (due: Date) =>
  due.toLocaleDateString(undefined, { day: "numeric", month: "short" });

const STAGE_COLOUR = {
  blocked: "#EF4444",
  done: "#10B981",
  working: "#3B82F6",
  next: "#F59E0B",
} as const;

/**
 * Status indicator that doubles as the card's own progress.
 *
 * A solid disc means no checklist — status only, nothing to report. A ring
 * means there is one, and the arc is how far along it is. Two shapes rather
 * than an empty ring, because an empty ring reads as "no step done yet" when
 * the truth is "nobody wrote any steps".
 */
function StatusMark({
  colour,
  progress,
}: {
  colour: string;
  progress: { done: number; total: number } | null;
}) {
  if (!progress) {
    return (
      <span
        className="flex h-[1.125rem] w-[1.125rem] flex-none items-center justify-center"
        aria-hidden
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: colour }}
        />
      </span>
    );
  }

  const pct = Math.round((progress.done / progress.total) * 100);

  return (
    <svg
      viewBox="0 0 32 32"
      className="h-[1.125rem] w-[1.125rem] flex-none -rotate-90"
      role="img"
      aria-label={`${progress.done} of ${progress.total} steps done`}
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        stroke="#9CA3AF"
        strokeOpacity={0.35}
        strokeWidth="5"
      />
      {pct > 0 && (
        <circle
          cx="16"
          cy="16"
          r="13"
          fill="none"
          stroke={colour}
          strokeWidth="5"
          strokeLinecap="round"
          // pathLength normalises the circumference to 100 so the dash array is
          // just the percentage — no 2*pi*r arithmetic to keep in sync with r.
          pathLength={100}
          strokeDasharray={`${pct} ${100 - pct}`}
        />
      )}
    </svg>
  );
}

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
        // No overflow-hidden: it would clip the hover panel that hangs below a
        // card. The rounded corners lose their clip on the first and last
        // cells, which is invisible against the same background.
        className="grid min-w-[52rem] rounded-md border border-light-300 bg-light-50 dark:border-dark-300 dark:bg-dark-50"
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
            {items.map(({ card, stage, isDone, isWorking, blocked }) => {
              const progress = checklistProgress(card);
              const pct = progress
                ? Math.round((progress.done / progress.total) * 100)
                : null;
              const step = nextStep(card);
              // Same rule as the wall: the next step is only news while the
              // card is actually moving. On a card still in the first list it
              // is just the first item, which the title already implies.
              const showStep = !!step && (isWorking || blocked);
              const due = card.dueDate ? new Date(card.dueDate) : null;
              const late = due && !isDone && isOverdue(due);
              const colour = blocked
                ? STAGE_COLOUR.blocked
                : isDone
                  ? STAGE_COLOUR.done
                  : isWorking
                    ? STAGE_COLOUR.working
                    : STAGE_COLOUR.next;

              return (
                <button
                  key={card.publicId}
                  type="button"
                  onClick={() => onOpenCard?.(card.publicId)}
                  className={`group relative rounded border px-2 py-1.5 text-left transition-colors ${
                    blocked
                      ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30"
                      : isDone
                        ? "border-light-300 bg-light-100 dark:border-dark-300 dark:bg-dark-100"
                        : isWorking
                          ? "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30"
                          : "border-light-300 bg-light-50 dark:border-dark-300 dark:bg-dark-50"
                  } ${onOpenCard ? "hover:border-light-500 dark:hover:border-dark-500" : ""}`}
                >
                  <span className="flex items-start gap-1.5">
                    <StatusMark colour={colour} progress={progress} />
                    <span className="min-w-0 flex-1">
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
                    </span>
                    {pct !== null && (
                      <span
                        className="flex-none pt-0.5 text-[11px] font-bold tabular-nums leading-none"
                        style={{ color: colour }}
                      >
                        {pct}%
                      </span>
                    )}
                  </span>

                  {showStep && (
                    <span className="mt-1 flex min-w-0 gap-1 pl-[1.625rem] text-[11px] font-semibold text-light-950 dark:text-dark-950">
                      <span className="flex-none font-bold" style={{ color: colour }}>
                        &rsaquo;
                      </span>
                      <span className="truncate">{step}</span>
                    </span>
                  )}

                  <span className="mt-0.5 block pl-[1.625rem] text-[11px] font-medium text-light-800 dark:text-dark-800">
                    {blocked ? `${t`Blocked`} · ${stage}` : stage}
                    {due && (
                      <span className={late ? "font-bold text-red-600 dark:text-red-400" : ""}>
                        {" · "}
                        {formatDue(due)}
                        {late && ` · ${t`overdue`}`}
                      </span>
                    )}
                  </span>

                  {progress && (
                    // The wall hides this panel in fullscreen, because a kiosk
                    // pointer parked over a card would leave one open all day.
                    // At a desk there is a person driving the pointer, so this
                    // is where it belongs.
                    <span className="pointer-events-none absolute left-2 top-[calc(100%+2px)] z-20 hidden w-60 rounded-md border border-light-400 bg-light-50 p-2 text-left shadow-lg group-hover:block dark:border-dark-400 dark:bg-dark-100">
                      <span className="mb-1 flex justify-between border-b border-light-300 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-light-900 dark:border-dark-300 dark:text-dark-900">
                        <span>{t`Checklist`}</span>
                        <span className="tabular-nums">
                          {progress.done} / {progress.total}
                        </span>
                      </span>
                      {card.checklists.map((group) => (
                        <span key={group.publicId} className="block">
                          {card.checklists.length > 1 && (
                            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-light-800 dark:text-dark-800">
                              {group.name}
                            </span>
                          )}
                          {group.items.map((item) => (
                            <span
                              key={item.publicId}
                              className={`flex gap-1 py-px text-[12px] leading-snug ${
                                item.completed
                                  ? "text-light-800 line-through dark:text-dark-800"
                                  : "font-semibold text-light-1000 dark:text-dark-1000"
                              }`}
                            >
                              <span
                                className="flex-none"
                                style={{ color: item.completed ? STAGE_COLOUR.done : "#9CA3AF" }}
                              >
                                {item.completed ? "\u2713" : "\u25a2"}
                              </span>
                              {item.title}
                            </span>
                          ))}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
