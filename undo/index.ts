// Undo for deletes (DESIGN-CONVENTIONS §3 "Deletes can be undone for 30
// minutes"). Pure and client-safe; the Postgres snapshot engine is the server
// subpath "@sequel/foundation/undo/postgres", the toast + strip are
// useUndoDelete / UndoStrip in "@sequel/foundation/ui".
export {
  UNDO_WINDOW_MINUTES,
  UNDO_WINDOW_MS,
  UNDO_CONFLICT_MESSAGE,
  UNDOABLE_DELETE_HINT,
  undoExpiresAt,
  undoTicket,
  undoRefusal,
  undoRefusalMessage,
  undoTicketExpired,
  undoTicketFrom,
} from "./window";
export type { UndoTicket, UndoRecordState, UndoRefusal } from "./window";
