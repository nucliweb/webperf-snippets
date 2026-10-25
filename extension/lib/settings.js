// What the panel remembers. The preferences go to chrome.storage.sync, so they follow the user to
// every Chrome they sign in to; the state of the panel changes often and stays in chrome.storage.local,
// since the synced area limits how many writes it takes per minute. Without chrome.storage, or when it
// fails, the panel uses the defaults and saves nothing.

// audits are the reports of the last audits (lib/audit.js), newest first, listed on the home page;
// reloadBeforeAudit makes the audit start from a fresh load of the page, as the CLI does; auditFilter
// is the rows the audit table shows (lib/audit.js): errors, issues (errors and warnings) or all
export const DEFAULTS = { theme: 'devtools', side: 'left', sidebar: 'expanded', snippet: null, audits: [], reloadBeforeAudit: true, auditFilter: 'issues' }
const SYNCED = new Set(['theme', 'side', 'reloadBeforeAudit', 'auditFilter'])

export function createSettings(storage) {
  const areaOf = (key) => (SYNCED.has(key) ? storage?.sync : storage?.local)
  const read = async (area, keys) => {
    try {
      return (await area?.get(keys)) ?? {}
    } catch {
      return {}
    }
  }
  const keys = Object.keys(DEFAULTS)
  return {
    async load() {
      const [synced, local] = await Promise.all([
        read(storage?.sync, keys.filter((k) => SYNCED.has(k))),
        read(storage?.local, keys.filter((k) => !SYNCED.has(k))),
      ])
      return { ...DEFAULTS, ...synced, ...local }
    },
    async save(key, value) {
      try {
        await areaOf(key)?.set({ [key]: value })
      } catch {
        // Nothing saved: the panel still works
      }
    },
  }
}
