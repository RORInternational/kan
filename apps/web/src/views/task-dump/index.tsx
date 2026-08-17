import { t } from "@lingui/core/macro";
import { useEffect, useMemo, useState } from "react";
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowRight,
  HiOutlineBriefcase,
  HiOutlineCheckCircle,
  HiOutlineHeart,
  HiOutlineInboxArrowDown,
  HiOutlineLightBulb,
  HiOutlineShoppingBag,
  HiOutlineSparkles,
  HiOutlineTrash,
  HiOutlineWrenchScrewdriver,
} from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import { generateUID } from "@kan/shared/utils";

import type {
  OrganizedTask,
  TaskArea,
  TaskPriority,
  TaskReason,
} from "~/utils/task-dump";
import Button from "~/components/Button";
import { PageHead } from "~/components/PageHead";
import { usePermissions } from "~/hooks/usePermissions";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import {
  getPriorityLabelPublicIds,
  organizeTaskDump,
  taskAreas,
  taskPriorities,
} from "~/utils/task-dump";

interface DraftTask extends OrganizedTask {
  id: string;
  selected: boolean;
}

interface StoredTaskDump {
  input: string;
  tasks: DraftTask[];
}

const priorityStyles: Record<TaskPriority, string> = {
  high: "border-red-300 bg-red-50 dark:border-red-900/70 dark:bg-red-950/20",
  medium:
    "border-amber-300 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/20",
  low: "border-sky-300 bg-sky-50 dark:border-sky-900/70 dark:bg-sky-950/20",
};

const priorityDotStyles: Record<TaskPriority, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
};

const areaIcons: Record<TaskArea, React.ReactNode> = {
  work: <HiOutlineBriefcase className="h-3.5 w-3.5" />,
  personal: <HiOutlineHeart className="h-3.5 w-3.5" />,
  admin: <HiOutlineWrenchScrewdriver className="h-3.5 w-3.5" />,
  health: <HiOutlineHeart className="h-3.5 w-3.5" />,
  errands: <HiOutlineShoppingBag className="h-3.5 w-3.5" />,
  ideas: <HiOutlineLightBulb className="h-3.5 w-3.5" />,
};

const getPriorityName = (priority: TaskPriority): string => {
  if (priority === "high") return t`High`;
  if (priority === "medium") return t`Medium`;
  return t`Low`;
};

const getAreaName = (area: TaskArea): string => {
  if (area === "work") return t`Work`;
  if (area === "admin") return t`Admin`;
  if (area === "health") return t`Health`;
  if (area === "errands") return t`Errands`;
  if (area === "ideas") return t`Ideas`;
  return t`Personal`;
};

const getReasonLabel = (reason: TaskReason): string => {
  if (reason === "flexible") return t`Flexible or exploratory language`;
  if (reason === "urgent") return t`Urgent or deadline-related language`;
  if (reason === "near-term") return t`Near-term or coordination work`;
  if (reason === "manual") return t`Priority adjusted manually`;
  return t`No urgent or deferrable signal found`;
};

const isStoredTaskDump = (value: unknown): value is StoredTaskDump => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredTaskDump>;
  return typeof candidate.input === "string" && Array.isArray(candidate.tasks);
};

const TaskCard = ({
  task,
  onChange,
  onRemove,
}: {
  task: DraftTask;
  onChange: (task: DraftTask) => void;
  onRemove: () => void;
}) => (
  <article
    className={twMerge(
      "rounded-lg border p-3 shadow-sm transition-opacity",
      priorityStyles[task.priority],
      !task.selected && "opacity-55",
    )}
  >
    <div className="flex items-start gap-2.5">
      <input
        type="checkbox"
        checked={task.selected}
        onChange={(event) =>
          onChange({ ...task, selected: event.currentTarget.checked })
        }
        className="mt-1 h-4 w-4 rounded border-light-500 text-light-1000 focus:ring-light-700 dark:border-dark-700 dark:bg-dark-200"
        aria-label={t`Include ${task.title}`}
      />
      <div className="min-w-0 flex-1">
        <input
          value={task.title}
          onChange={(event) =>
            onChange({ ...task, title: event.currentTarget.value })
          }
          className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-light-1000 placeholder:text-light-700 focus:ring-0 dark:text-dark-1000"
          aria-label={t`Task title`}
        />
        <p className="mt-1 text-xs text-light-800 dark:text-dark-800">
          {getReasonLabel(task.reason)}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1 text-light-800 hover:bg-black/5 hover:text-light-1000 dark:text-dark-800 dark:hover:bg-white/10 dark:hover:text-dark-1000"
        aria-label={t`Remove ${task.title}`}
      >
        <HiOutlineTrash className="h-4 w-4" />
      </button>
    </div>
    <div className="mt-3 flex gap-2">
      <label className="relative flex-1">
        <span className="sr-only">{t`Priority`}</span>
        <select
          value={task.priority}
          onChange={(event) =>
            onChange({
              ...task,
              priority: event.currentTarget.value as TaskPriority,
              reason: "manual",
            })
          }
          className="w-full appearance-none rounded-md border-0 bg-white/70 py-1.5 pl-7 pr-2 text-xs font-medium text-light-1000 ring-1 ring-inset ring-black/10 focus:ring-2 focus:ring-light-700 dark:bg-black/20 dark:text-dark-1000 dark:ring-white/10"
        >
          {taskPriorities.map((priority) => (
            <option key={priority} value={priority}>
              {getPriorityName(priority)}
            </option>
          ))}
        </select>
        <span
          className={twMerge(
            "pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full",
            priorityDotStyles[task.priority],
          )}
        />
      </label>
      <label className="relative flex-1">
        <span className="sr-only">{t`Area`}</span>
        <select
          value={task.area}
          onChange={(event) =>
            onChange({
              ...task,
              area: event.currentTarget.value as TaskArea,
            })
          }
          className="w-full appearance-none rounded-md border-0 bg-white/70 py-1.5 pl-8 pr-2 text-xs font-medium text-light-1000 ring-1 ring-inset ring-black/10 focus:ring-2 focus:ring-light-700 dark:bg-black/20 dark:text-dark-1000 dark:ring-white/10"
        >
          {taskAreas.map((area) => (
            <option key={area} value={area}>
              {getAreaName(area)}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-light-800 dark:text-dark-800">
          {areaIcons[task.area]}
        </span>
      </label>
    </div>
  </article>
);

export default function TaskDumpView() {
  const { workspace } = useWorkspace();
  const { canCreateCard } = usePermissions();
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const [input, setInput] = useState("");
  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [selectedBoardPublicId, setSelectedBoardPublicId] = useState("");
  const [selectedListPublicId, setSelectedListPublicId] = useState("");
  const [loadedWorkspacePublicId, setLoadedWorkspacePublicId] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { data: boards = [], isLoading: boardsLoading } =
    api.board.all.useQuery(
      {
        workspacePublicId: workspace.publicId,
        type: "regular",
        archived: false,
      },
      { enabled: workspace.publicId.length >= 12 },
    );

  const createCard = api.card.create.useMutation();
  const selectedBoard = boards.find(
    (board) => board.publicId === selectedBoardPublicId,
  );
  const selectedTasks = tasks.filter(
    (task) => task.selected && task.title.trim().length > 0,
  );

  const tasksByPriority = useMemo(
    () =>
      taskPriorities.reduce<Record<TaskPriority, DraftTask[]>>(
        (grouped, priority) => {
          grouped[priority] = tasks.filter(
            (task) => task.priority === priority,
          );
          return grouped;
        },
        { high: [], medium: [], low: [] },
      ),
    [tasks],
  );

  useEffect(() => {
    if (!workspace.publicId) return;
    const storedValue = localStorage.getItem(
      `kan_task-dump_${workspace.publicId}`,
    );

    if (storedValue) {
      try {
        const parsedValue: unknown = JSON.parse(storedValue);
        if (isStoredTaskDump(parsedValue)) {
          setInput(parsedValue.input);
          setTasks(parsedValue.tasks);
        }
      } catch {
        localStorage.removeItem(`kan_task-dump_${workspace.publicId}`);
      }
    } else {
      setInput("");
      setTasks([]);
    }

    setLoadedWorkspacePublicId(workspace.publicId);
  }, [workspace.publicId]);

  useEffect(() => {
    if (!workspace.publicId || loadedWorkspacePublicId !== workspace.publicId)
      return;

    localStorage.setItem(
      `kan_task-dump_${workspace.publicId}`,
      JSON.stringify({ input, tasks } satisfies StoredTaskDump),
    );
  }, [input, tasks, workspace.publicId, loadedWorkspacePublicId]);

  useEffect(() => {
    if (!boards.length) {
      setSelectedBoardPublicId("");
      return;
    }

    if (!boards.some((board) => board.publicId === selectedBoardPublicId)) {
      setSelectedBoardPublicId(boards[0]?.publicId ?? "");
    }
  }, [boards, selectedBoardPublicId]);

  useEffect(() => {
    const lists = selectedBoard?.lists ?? [];
    if (!lists.some((list) => list.publicId === selectedListPublicId)) {
      setSelectedListPublicId(lists[0]?.publicId ?? "");
    }
  }, [selectedBoard, selectedListPublicId]);

  const handleOrganize = () => {
    const organizedTasks = organizeTaskDump(input).map((task) => ({
      ...task,
      id: generateUID(),
      selected: true,
    }));

    setTasks(organizedTasks);

    if (!organizedTasks.length) {
      showPopup({
        header: t`No tasks found`,
        message: t`Add a few actions or reminders, then try again.`,
        icon: "info",
      });
    }
  };

  const updateTask = (updatedTask: DraftTask) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === updatedTask.id ? updatedTask : task,
      ),
    );
  };

  const handleCreateCards = async () => {
    if (!selectedBoard || !selectedListPublicId || !selectedTasks.length)
      return;

    setIsCreating(true);
    const createdTaskIds: string[] = [];

    for (const task of selectedTasks) {
      try {
        const priorityName = getPriorityName(task.priority);
        const areaName = getAreaName(task.area);
        await createCard.mutateAsync({
          title: task.title.trim(),
          description: `<p><strong>${t`Priority`}:</strong> ${priorityName}</p><p><strong>${t`Area`}:</strong> ${areaName}</p><p>${t`Captured from Task Dump.`}</p>`,
          listPublicId: selectedListPublicId,
          labelPublicIds: getPriorityLabelPublicIds(
            task.priority,
            selectedBoard.labels,
          ),
          memberPublicIds: [],
          position: "end",
          dueDate: null,
        });
        createdTaskIds.push(task.id);
      } catch {
        break;
      }
    }

    setTasks((currentTasks) =>
      currentTasks.filter((task) => !createdTaskIds.includes(task.id)),
    );
    await utils.board.byId.invalidate();
    setIsCreating(false);

    if (createdTaskIds.length === selectedTasks.length) {
      showPopup({
        header: t`Tasks added`,
        message: t`${createdTaskIds.length} tasks were added to ${selectedBoard.name}.`,
        icon: "success",
      });
      return;
    }

    showPopup({
      header: t`Some tasks could not be added`,
      message: t`${createdTaskIds.length} of ${selectedTasks.length} tasks were created. The remaining tasks are still here.`,
      icon: "error",
    });
  };

  const destinationUnavailable =
    !selectedBoardPublicId || !selectedListPublicId || boardsLoading;

  return (
    <>
      <PageHead title={t`Task Dump | ${workspace.name || t`Workspace`}`} />
      <main className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden">
        <header className="border-b border-light-300 px-5 py-5 dark:border-dark-300 md:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-light-1000 text-light-50 dark:bg-dark-1000 dark:text-dark-50">
              <HiOutlineInboxArrowDown className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-light-1000 dark:text-dark-1000">
                {t`Task Dump`}
              </h1>
              <p className="text-sm text-light-800 dark:text-dark-800">
                {t`Empty your head. We’ll turn it into a prioritized plan.`}
              </p>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.7fr)] lg:overflow-hidden">
          <section className="border-b border-light-300 p-5 dark:border-dark-300 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-6">
            <div className="mb-4">
              <div className="mb-1 flex items-center gap-2">
                <HiOutlineSparkles className="h-4 w-4 text-light-800 dark:text-dark-800" />
                <h2 className="text-sm font-semibold text-light-1000 dark:text-dark-1000">
                  {t`Talk it out`}
                </h2>
              </div>
              <p className="text-xs leading-5 text-light-800 dark:text-dark-800">
                {t`Write naturally, paste a list, or add one thought per line. Deadlines and words like “urgent” or “someday” help set priority.`}
              </p>
            </div>

            <textarea
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
              placeholder={t`I need to send the client update today. Book a dentist appointment. Maybe research a better reporting tool someday…`}
              className="min-h-[260px] w-full resize-y rounded-xl border-0 bg-light-50 p-4 text-sm leading-6 text-light-1000 shadow-sm ring-1 ring-inset ring-light-400 placeholder:text-light-700 focus:ring-2 focus:ring-inset focus:ring-light-700 dark:bg-dark-100 dark:text-dark-1000 dark:ring-dark-500 dark:placeholder:text-dark-700 dark:focus:ring-dark-700 lg:min-h-[360px]"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-light-700 dark:text-dark-700">
                {input.trim().length > 0
                  ? t`${input.trim().split(/\s+/).length} words captured`
                  : t`Your draft is saved automatically`}
              </span>
              <Button
                type="button"
                onClick={handleOrganize}
                disabled={!input.trim()}
                iconLeft={<HiOutlineSparkles className="h-4 w-4" />}
              >
                {tasks.length ? t`Organize again` : t`Organize tasks`}
              </Button>
            </div>

            <div className="mt-8 border-t border-light-300 pt-5 dark:border-dark-300">
              <div className="mb-3 flex items-center gap-2">
                <HiOutlineArrowRight className="h-4 w-4 text-light-800 dark:text-dark-800" />
                <h2 className="text-sm font-semibold text-light-1000 dark:text-dark-1000">
                  {t`Send selected tasks to`}
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <label className="text-xs font-medium text-light-900 dark:text-dark-900">
                  <span className="mb-1.5 block">{t`Board`}</span>
                  <select
                    value={selectedBoardPublicId}
                    onChange={(event) =>
                      setSelectedBoardPublicId(event.currentTarget.value)
                    }
                    disabled={boardsLoading || !boards.length}
                    className="w-full rounded-md border-0 bg-light-50 py-2 text-sm text-light-1000 shadow-sm ring-1 ring-inset ring-light-400 focus:ring-2 focus:ring-light-700 dark:bg-dark-100 dark:text-dark-1000 dark:ring-dark-500"
                  >
                    {!boards.length && <option value="">{t`No boards`}</option>}
                    {boards.map((board) => (
                      <option key={board.publicId} value={board.publicId}>
                        {board.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-medium text-light-900 dark:text-dark-900">
                  <span className="mb-1.5 block">{t`List`}</span>
                  <select
                    value={selectedListPublicId}
                    onChange={(event) =>
                      setSelectedListPublicId(event.currentTarget.value)
                    }
                    disabled={!selectedBoard?.lists.length}
                    className="w-full rounded-md border-0 bg-light-50 py-2 text-sm text-light-1000 shadow-sm ring-1 ring-inset ring-light-400 focus:ring-2 focus:ring-light-700 dark:bg-dark-100 dark:text-dark-1000 dark:ring-dark-500"
                  >
                    {!selectedBoard?.lists.length && (
                      <option value="">{t`No lists`}</option>
                    )}
                    {selectedBoard?.lists.map((list) => (
                      <option key={list.publicId} value={list.publicId}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <Button
                type="button"
                fullWidth
                className="mt-3"
                isLoading={isCreating}
                disabled={
                  !canCreateCard ||
                  destinationUnavailable ||
                  !selectedTasks.length
                }
                onClick={handleCreateCards}
                iconLeft={<HiOutlineCheckCircle className="h-4 w-4" />}
              >
                {selectedTasks.length
                  ? t`Create ${selectedTasks.length} cards`
                  : t`Select tasks to create`}
              </Button>

              {!canCreateCard && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  {t`You don’t have permission to create cards in this workspace.`}
                </p>
              )}
            </div>
          </section>

          <section className="min-h-[420px] bg-light-100 p-5 dark:bg-dark-100 lg:overflow-y-auto lg:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <HiOutlineAdjustmentsHorizontal className="h-4 w-4 text-light-800 dark:text-dark-800" />
                  <h2 className="text-sm font-semibold text-light-1000 dark:text-dark-1000">
                    {t`Prioritized plan`}
                  </h2>
                </div>
                <p className="mt-1 text-xs text-light-800 dark:text-dark-800">
                  {tasks.length
                    ? t`Review the suggestions before creating cards.`
                    : t`Your organized tasks will appear here.`}
                </p>
              </div>
              {!!tasks.length && (
                <span className="rounded-full bg-light-300 px-2.5 py-1 text-xs font-semibold text-light-900 dark:bg-dark-300 dark:text-dark-900">
                  {t`${tasks.length} tasks`}
                </span>
              )}
            </div>

            {!tasks.length ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-light-400 bg-light-50/60 px-6 text-center dark:border-dark-500 dark:bg-dark-50/40">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-light-200 text-light-800 dark:bg-dark-200 dark:text-dark-800">
                  <HiOutlineSparkles className="h-6 w-6" />
                </span>
                <p className="text-sm font-semibold text-light-1000 dark:text-dark-1000">
                  {t`Ready when you are`}
                </p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-light-800 dark:text-dark-800">
                  {t`Add everything on your mind. The task dump will separate it into clear actions and suggest what to do first.`}
                </p>
              </div>
            ) : (
              <div className="grid items-start gap-4 xl:grid-cols-3">
                {taskPriorities.map((priority) => (
                  <div key={priority} className="min-w-0">
                    <div className="mb-3 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={twMerge(
                            "h-2.5 w-2.5 rounded-full",
                            priorityDotStyles[priority],
                          )}
                        />
                        <h3 className="text-xs font-bold uppercase tracking-wide text-light-900 dark:text-dark-900">
                          {priority === "high"
                            ? t`Do first`
                            : priority === "medium"
                              ? t`Plan next`
                              : t`Later`}
                        </h3>
                      </div>
                      <span className="text-xs text-light-700 dark:text-dark-700">
                        {tasksByPriority[priority].length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {tasksByPriority[priority].map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onChange={updateTask}
                          onRemove={() =>
                            setTasks((currentTasks) =>
                              currentTasks.filter(
                                (currentTask) => currentTask.id !== task.id,
                              ),
                            )
                          }
                        />
                      ))}
                      {!tasksByPriority[priority].length && (
                        <div className="rounded-lg border border-dashed border-light-400 px-3 py-6 text-center text-xs text-light-700 dark:border-dark-500 dark:text-dark-700">
                          {t`No tasks here`}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
