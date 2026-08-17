import { kanRequest } from "./client.js";

export interface WorkspaceSummary {
  publicId: string;
  name: string;
}

/**
 * `GET /workspaces` returns membership records, not workspaces:
 * `[{ role, workspace: { publicId, name, ... } }]`. Reading `.name` off the
 * outer object yields undefined, which is why name lookups used to fail with
 * "Cannot read properties of undefined (reading 'toLowerCase')".
 *
 * Unwraps the nested shape and tolerates a flat one, so this keeps working if
 * the endpoint's envelope ever changes.
 */
export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const rows = await kanRequest<unknown[]>("GET", "/workspaces");

  if (!Array.isArray(rows)) return [];

  return rows.flatMap((row) => {
    const source =
      row && typeof row === "object" && "workspace" in row
        ? (row as { workspace: unknown }).workspace
        : row;

    if (!source || typeof source !== "object") return [];

    const { publicId, name } = source as Partial<WorkspaceSummary>;
    if (typeof publicId !== "string" || typeof name !== "string") return [];

    return [{ publicId, name }];
  });
}

/** Case-insensitive name lookup shared by the find_*_by_name tools. */
export function matchByName<T extends { name: string }>(
  items: T[],
  name: string,
): T | undefined {
  const target = name.trim().toLowerCase();
  return items.find((item) => item.name.trim().toLowerCase() === target);
}
