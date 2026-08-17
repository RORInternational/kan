export const taskPriorities = ["high", "medium", "low"] as const;
export const taskAreas = [
  "work",
  "personal",
  "admin",
  "health",
  "errands",
  "ideas",
] as const;

export type TaskPriority = (typeof taskPriorities)[number];
export type TaskArea = (typeof taskAreas)[number];
export type TaskReason =
  | "flexible"
  | "urgent"
  | "near-term"
  | "neutral"
  | "manual";

export interface OrganizedTask {
  title: string;
  priority: TaskPriority;
  area: TaskArea;
  reason: TaskReason;
}

const HIGH_PRIORITY_TERMS =
  /\b(urgent|asap|immediately|critical|overdue|blocked|today|tonight|must|deadline|due|submit|launch)\b/i;
const MEDIUM_PRIORITY_TERMS =
  /\b(tomorrow|this week|soon|client|customer|appointment|meeting|call|follow up|fix|pay)\b/i;
const LOW_PRIORITY_TERMS =
  /\b(someday|maybe|eventually|whenever|optional|idea|consider|explore|could|nice to have)\b/i;

const AREA_PATTERNS: { area: TaskArea; pattern: RegExp }[] = [
  {
    area: "health",
    pattern:
      /\b(doctor|dentist|health|medicine|medication|gym|workout|exercise|therapy|appointment)\b/i,
  },
  {
    area: "errands",
    pattern:
      /\b(buy|pick up|pickup|grocer|shop|store|post office|deliver|return|collect)\b/i,
  },
  {
    area: "admin",
    pattern:
      /\b(invoice|bill|tax|renew|form|paperwork|book|schedule|email|reply|follow up|pay)\b/i,
  },
  {
    area: "ideas",
    pattern:
      /\b(idea|brainstorm|research|explore|consider|maybe|prototype|experiment)\b/i,
  },
  {
    area: "work",
    pattern:
      /\b(project|client|customer|report|presentation|meeting|launch|deploy|review|team|stakeholder|work)\b/i,
  },
];

const cleanTaskTitle = (value: string): string =>
  value
    .replace(/^\s*(?:[-*•]+|\d+[.)]|\[[ xX]?\])\s*/, "")
    .replace(/^\s*(?:i\s+)?(?:need|have|want|must|should)\s+to\s+/i, "")
    .replace(/^\s*(?:please\s+)?(?:remember|don['’]t forget)\s+to\s+/i, "")
    .replace(/^\s*(?:and\s+)?then\s+/i, "")
    .replace(/[.!?;,]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

const splitIntoCandidates = (input: string): string[] =>
  input
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?;])\s+/)
    .flatMap((value) => value.split(/\s+(?:and then|then|also)\s+/i))
    .map(cleanTaskTitle)
    .filter((value) => value.length >= 3);

const getPriority = (
  title: string,
): Pick<OrganizedTask, "priority" | "reason"> => {
  if (LOW_PRIORITY_TERMS.test(title) && !HIGH_PRIORITY_TERMS.test(title)) {
    return {
      priority: "low",
      reason: "flexible",
    };
  }

  if (HIGH_PRIORITY_TERMS.test(title)) {
    return {
      priority: "high",
      reason: "urgent",
    };
  }

  if (MEDIUM_PRIORITY_TERMS.test(title)) {
    return {
      priority: "medium",
      reason: "near-term",
    };
  }

  return {
    priority: "medium",
    reason: "neutral",
  };
};

const getArea = (title: string): TaskArea =>
  AREA_PATTERNS.find(({ pattern }) => pattern.test(title))?.area ?? "personal";

export const organizeTaskDump = (input: string): OrganizedTask[] => {
  const seen = new Set<string>();

  return splitIntoCandidates(input).flatMap((title) => {
    const normalizedTitle = title.toLocaleLowerCase();
    if (seen.has(normalizedTitle)) return [];
    seen.add(normalizedTitle);

    return [
      {
        title,
        area: getArea(title),
        ...getPriority(title),
      },
    ];
  });
};

export const getPriorityLabelPublicIds = (
  priority: TaskPriority,
  labels: { publicId: string; name: string }[],
): string[] => {
  const matchingNames: Record<TaskPriority, string[]> = {
    high: ["urgent", "high", "high priority", "priority"],
    medium: ["medium", "medium priority"],
    low: ["low", "low priority"],
  };

  const match = labels.find((label) =>
    matchingNames[priority].includes(label.name.trim().toLocaleLowerCase()),
  );

  return match ? [match.publicId] : [];
};
