// The Debug tab's log as plain data, no DOM. The server streams entries
// { seq, time, kind, text }, where kind is send, receive, note, error or
// status, and seq counts up from 1 each time the server starts.

export const MAX_ROWS = 2000;

const ARROWS = { send: "→", receive: "←" };
const COPY_MARKS = { send: "->", receive: "<-", note: "//", error: "!!" };

export const arrowFor = (kind) => ARROWS[kind] || "";

export function copyText(entries) {
  return entries.map((e) => `${e.time} ${COPY_MARKS[e.kind]} ${e.text}`).join("\n");
}

export function statusText(status, connecting = "") {
  if (connecting) return `Connecting to ${connecting}…`;
  if (!status?.connected) return "Not connected";
  if (!status.model) return `Connected to ${status.host}`;
  return `Connected to ${status.model} at ${status.host} · firmware ${status.version}`;
}

// The rows to show. accept() filters out entries a reconnecting stream
// replays; start() resets when the server has restarted.
export function createLog(limit = MAX_ROWS) {
  const log = {
    boot: "",
    lastSeq: 0,
    entries: [],
    start(boot) {
      if (boot === log.boot) return false;
      log.boot = boot;
      log.lastSeq = 0;
      log.entries = [];
      return true;
    },
    accept(entry) {
      if (entry.seq <= log.lastSeq) return false;
      log.lastSeq = entry.seq;
      return true;
    },
    add(entry) {
      log.entries.push(entry);
      const over = Math.max(0, log.entries.length - limit);
      log.entries.splice(0, over);
      return over;
    },
    clear() {
      log.entries = [];
    },
  };
  return log;
}
