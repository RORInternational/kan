import { keepPreviousData } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "~/utils/api";

/** How often to pull fresh board data. */
const POLL_MS = 10_000;
/** How long a card stays highlighted after it appears or moves. */
const FRESH_MS = 90_000;

const LANE_COLOURS = [
  "#7DD3FC",
  "#FCD34D",
  "#C4B5FD",
  "#6EE7A8",
  "#F9A8D4",
  "#FDBA74",
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const formatDue = (due: Date) =>
  due.toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/** A card counts as done when its list is the board's last one. */
const useClock = () => {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
};

const useAgo = (stamp: number | null) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (stamp === null) return null;
  return Math.max(0, Math.round((Date.now() - stamp) / 1000));
};

export default function TvView() {
  const router = useRouter();
  const boardId = Array.isArray(router.query.boardId)
    ? router.query.boardId[0]
    : router.query.boardId;

  const { data: board, dataUpdatedAt, isError, isPending } = api.board.byId.useQuery(
    { boardPublicId: boardId ?? "" },
    {
      enabled: !!boardId,
      refetchInterval: POLL_MS,
      // Keep the wall showing the last good data while a refetch is in flight,
      // so it never flashes a loading state at the room.
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: true,
    },
  );

  const clock = useClock();
  const ago = useAgo(dataUpdatedAt || null);

  // Remember when each card was first seen in its current list, so a new or
  // moved card can be highlighted briefly.
  const seen = useRef(new Map<string, { list: string; at: number }>());
  // The first snapshot is the existing state of the board, not news. Without
  // this every card would light up as "just now" when the screen boots.
  const primed = useRef(false);
  const [, forceTick] = useState(0);

  const lists = board?.lists ?? [];
  const doneListId = lists.length ? lists[lists.length - 1]?.publicId : undefined;

  useEffect(() => {
    if (!board) return;
    const stamp = primed.current ? Date.now() : 0;
    for (const list of board.lists) {
      for (const card of list.cards) {
        const prev = seen.current.get(card.publicId);
        if (!prev || prev.list !== list.publicId) {
          seen.current.set(card.publicId, { list: list.publicId, at: stamp });
        }
      }
    }
    primed.current = true;
    const id = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [board]);

  const totals = useMemo(() => {
    const all = lists.flatMap((l) => l.cards);
    const done = doneListId
      ? (lists.find((l) => l.publicId === doneListId)?.cards.length ?? 0)
      : 0;
    return { all: all.length, done, open: all.length - done };
  }, [lists, doneListId]);

  if (isError) {
    return (
      <Shell>
        <p className="text-[2vw] font-semibold text-red-300">
          Can&rsquo;t load this board. Check the display account is signed in.
        </p>
      </Shell>
    );
  }

  if (isPending || !board) {
    return (
      <Shell>
        <p className="text-[2vw] font-semibold text-neutral-500">Loading board…</p>
      </Shell>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0B0F10] text-[#EAF0EF]">
      <header className="flex flex-none items-center justify-between border-b border-[#1E2626] px-[2.2vw] pb-[1.2vw] pt-[1.8vw]">
        <div className="flex items-baseline gap-[1.2vw]">
          <h1 className="text-[3.4vw] font-extrabold leading-none tracking-[-0.04em] text-white">
            {board.name}
          </h1>
          <span className="text-[1.15vw] font-semibold uppercase tracking-[0.22em] text-[#5C6B6A]">
            {board.workspace.cardPrefix}
          </span>
        </div>
        <div className="flex items-center gap-[2vw]">
          <span className="flex items-center gap-[0.6vw] text-[1.15vw] font-bold tracking-[0.14em] text-[#4ADE9B]">
            <span className="tv-pulse h-[0.8vw] w-[0.8vw] rounded-full bg-[#4ADE9B]" />
            LIVE
          </span>
          <span className="text-[2vw] font-bold tabular-nums tracking-[-0.02em]">
            {clock
              ? clock.toLocaleTimeString("en-AU", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              : "--:--"}
          </span>
        </div>
      </header>

      <div
        className="grid min-h-0 flex-1 gap-[1.2vw] px-[2.2vw] py-[1.5vw]"
        style={{ gridTemplateColumns: `repeat(${Math.max(lists.length, 1)}, minmax(0, 1fr))` }}
      >
        {lists.map((list, i) => (
          <section key={list.publicId} className="flex min-h-0 flex-col">
            <div className="mb-[1.2vw] flex flex-none items-center gap-[0.9vw] border-b-[0.4vw] border-[#1B2323] pb-[1vw]">
              <span
                className="flex h-[2.6vw] w-[2.6vw] flex-none items-center justify-center rounded-full text-[1.25vw] font-extrabold text-[#0B0F10]"
                style={{ background: LANE_COLOURS[i % LANE_COLOURS.length] }}
              >
                {initials(list.name)}
              </span>
              <h2 className="text-[1.9vw] font-bold tracking-[-0.02em] text-white">
                {list.name}
              </h2>
              <span className="ml-auto text-[1.45vw] font-bold tabular-nums text-[#5C6B6A]">
                {list.cards.length}
              </span>
            </div>

            <div className="flex min-h-0 flex-col gap-[0.9vw] overflow-hidden">
              {list.cards.length === 0 && (
                <p className="rounded-[0.7vw] border border-dashed border-[#223030] px-[1.5vw] py-[1.6vw] text-center text-[1.25vw] font-semibold text-[#3F4E4D]">
                  Nothing here
                </p>
              )}

              {list.cards.map((card) => {
                const isDone = list.publicId === doneListId;
                const mark = seen.current.get(card.publicId);
                // at === 0 marks a card that was already there on first load.
                const fresh = !!mark && mark.at > 0 && Date.now() - mark.at < FRESH_MS;
                return (
                  <article
                    key={card.publicId}
                    className="rounded-[0.7vw] bg-[#141B1B] px-[1.4vw] py-[1.3vw]"
                    style={{
                      borderLeft: `0.42vw solid ${
                        fresh ? "#4ADE9B" : isDone ? "#2A3535" : "#F87171"
                      }`,
                      background: fresh ? "#15211D" : undefined,
                    }}
                  >
                    {card.cardNumber !== null && (
                      <p className="mb-[0.5vw] text-[1.05vw] font-bold tracking-[0.1em] text-[#546564]">
                        {board.workspace.cardPrefix}-{card.cardNumber}
                      </p>
                    )}
                    <h3 className="text-[1.65vw] font-semibold leading-[1.28] tracking-[-0.015em] text-[#F2F7F6]">
                      {card.title}
                    </h3>
                    <div className="mt-[1vw] flex items-center gap-[1vw]">
                      <span
                        className="inline-flex items-center gap-[0.45vw] rounded-full px-[0.85vw] py-[0.35vw] text-[1.05vw] font-bold"
                        style={
                          isDone
                            ? { background: "#152A20", color: "#6EE7A8" }
                            : { background: "#2A1A1A", color: "#FCA5A5" }
                        }
                      >
                        <span
                          className="h-[0.65vw] w-[0.65vw] rounded-full"
                          style={{ background: isDone ? "#4ADE9B" : "#F87171" }}
                        />
                        {isDone ? "Done" : "Not done"}
                      </span>
                      {card.dueDate && (
                        <span className="text-[1.1vw] font-semibold text-[#6B7A79]">
                          {formatDue(new Date(card.dueDate))}
                        </span>
                      )}
                      {fresh && (
                        <span className="ml-auto text-[0.9vw] font-extrabold uppercase tracking-[0.12em] text-[#4ADE9B]">
                          just now
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="flex flex-none items-center justify-between border-t border-[#1E2626] bg-[#0A0D0E] px-[2.2vw] py-[1vw] text-[1.1vw] font-semibold text-[#546564]">
        <span>
          {totals.all} cards · {totals.open} not done · {totals.done} done
        </span>
        <span className="text-[#7C8B8A]">
          {ago === null
            ? "syncing…"
            : ago < 60
              ? `updated ${ago}s ago`
              : `updated ${Math.floor(ago / 60)}m ago`}
        </span>
      </footer>

      <style jsx global>{`
        .tv-pulse {
          animation: tvpulse 2.4s infinite;
        }
        @keyframes tvpulse {
          0% {
            box-shadow: 0 0 0 0 rgba(74, 222, 155, 0.55);
          }
          70% {
            box-shadow: 0 0 0 1.2vw rgba(74, 222, 155, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(74, 222, 155, 0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .tv-pulse {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0B0F10]">
      {children}
    </div>
  );
}
