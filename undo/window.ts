// Undo for deletes (DESIGN-CONVENTIONS §3 "Deletes can be undone for 30
// minutes"). Pure and client-safe: the window, the ticket a delete hands the
// browser, and the one rule a restore route asks before it writes anything.
// The Postgres snapshot engine that records what a delete removed lives in
// "@sequel/foundation/undo/postgres" (server only).

/** How long a delete can be undone. Owner ruling 2026-10-20 (Mike: "Undo
 *  Toast (timer 30 minutes)"); Scheduler Hub's Delete selected set it first. */
export const UNDO_WINDOW_MINUTES = 30;
export const UNDO_WINDOW_MS = UNDO_WINDOW_MINUTES * 60_000;

/** What a delete route returns so the browser can offer Undo. `id` names the
 *  stored snapshot (never the deleted record's own id alone). */
export type UndoTicket = {
  id: string;
  /** What was deleted, in words: "Routing rule “Falls → Safety”". */
  label: string;
  /** ISO time the undo window closes. */
  expiresAt: string;
};

/** The facts the restore rule reads from a stored snapshot. */
export type UndoRecordState = {
  deletedAt: Date;
  /** Who deleted it — an email (compared case-insensitively) or a user id. */
  deletedBy: string;
  restoredAt?: Date | null;
};

export type UndoRefusal = "missing" | "not-yours" | "already-restored" | "expired";

export function undoExpiresAt(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + UNDO_WINDOW_MS);
}

export function undoTicket(id: string, label: string, deletedAt: Date): UndoTicket {
  return { id, label, expiresAt: undoExpiresAt(deletedAt).toISOString() };
}

const sameActor = (a: string, b: string) => {
  const x = a.trim().toLowerCase();
  return x !== "" && x === b.trim().toLowerCase();
};

/**
 * May `actor` undo this delete now? Only the person who deleted it, once,
 * inside the window. `null` = allowed. A route answers every refusal except
 * `expired` with the same words (`undoRefusalMessage`), so a ticket id never
 * tells someone else whether a delete exists. A blank deleter matches no one.
 * The route marks the snapshot restored in the same transaction as the
 * restore, with a conditional write (`WHERE "restoredAt" IS NULL`), so two
 * Undo clicks at once can't both restore.
 */
export function undoRefusal(
  record: UndoRecordState | null | undefined,
  actor: string | null | undefined,
  now: Date = new Date(),
): UndoRefusal | null {
  if (!record) return "missing";
  if (!actor || !sameActor(record.deletedBy, actor)) return "not-yours";
  if (record.restoredAt) return "already-restored";
  if (now.getTime() > undoExpiresAt(record.deletedAt).getTime()) return "expired";
  return null;
}

export function undoRefusalMessage(refusal: UndoRefusal): string {
  return refusal === "expired"
    ? `The ${UNDO_WINDOW_MINUTES}-minute undo window has passed, so this delete can't be undone.`
    : "This delete can't be undone.";
}

/** A restore that would clash with what happened since (a record with the
 *  same name was added, or something it belonged to was deleted). */
export const UNDO_CONFLICT_MESSAGE =
  "This can't be restored because something it depends on changed after the delete — for example, a record with the same name was added, or the record it belonged to was deleted.";

/** Confirm-dialog wording for an undoable delete (replaces "This cannot be undone."). */
export const UNDOABLE_DELETE_HINT = `You can undo this for ${UNDO_WINDOW_MINUTES} minutes.`;

/** Has the ticket's window closed? (client: hide the strip) */
export function undoTicketExpired(ticket: Pick<UndoTicket, "expiresAt">, now: Date = new Date()): boolean {
  return now.getTime() > new Date(ticket.expiresAt).getTime();
}

/** Read a delete route's JSON for a ticket (`{ undo: UndoTicket }`); null when absent or malformed. */
export function undoTicketFrom(body: unknown): UndoTicket | null {
  const u = (body as { undo?: unknown } | null)?.undo as Partial<UndoTicket> | undefined;
  if (!u || typeof u.id !== "string" || typeof u.label !== "string" || typeof u.expiresAt !== "string") return null;
  if (Number.isNaN(new Date(u.expiresAt).getTime())) return null;
  return { id: u.id, label: u.label, expiresAt: u.expiresAt };
}
