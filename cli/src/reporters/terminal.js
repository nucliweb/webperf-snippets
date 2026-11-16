import { stripVTControlCharacters } from "node:util";

// What the human report knows of where it is written. A terminal draws emoji and has a width, which
// the report cuts its longest texts to; a pipe, a file or the log of a CI job has neither, so it
// gets marks that are plain characters and every text whole.
export const terminalOf = (stream) => (stream.isTTY ? { emoji: true, columns: stream.columns } : { emoji: false });

// The report of a caller that does not say where it writes
export const ANY_TERMINAL = { emoji: true };

// Fills `text` with spaces up to `len` columns, without counting the codes of its styles
export function pad(text, len) {
  return text + " ".repeat(Math.max(0, len - stripVTControlCharacters(text).length));
}

// `text`, which has no styles yet, cut to `len` columns with an ellipsis
export function fit(text, len) {
  return text.length > len ? `${text.slice(0, Math.max(len - 1, 0))}…` : text;
}

// The columns left on a line after the `used` ones, never so few that what goes there says nothing.
// Without a width there is no limit.
export function room(terminal, used) {
  return terminal.columns ? Math.max(terminal.columns - used, 12) : Infinity;
}
