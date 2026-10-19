// The setups the MCP evals compare. Each one is an agent with the same model and prompt and no settings,
// skills or MCP servers of the machine, plus:
//   webperf         the MCP server of this repository (node cli/src/bin.js mcp)
//   devtools-skill  Chrome DevTools MCP and the webperf skills, the path the README describes
//   devtools        Chrome DevTools MCP alone, where the agent writes its own measurement code

export const DEVTOOLS_MCP = 'chrome-devtools-mcp@1.11.0'

export function arms({ root, pluginDir }) {
  const devtools = { 'chrome-devtools': { command: 'npx', args: ['-y', DEVTOOLS_MCP, '--headless', '--isolated'] } }
  return [
    {
      id: 'webperf',
      mcpServers: { webperf: { command: 'node', args: [`${root}/cli/src/bin.js`, 'mcp'] } },
      tools: '',
      allowedTools: ['mcp__webperf'],
    },
    {
      id: 'devtools-skill',
      mcpServers: devtools,
      // Read for the scripts of the skills, Skill to load them
      tools: 'Read,Skill',
      allowedTools: ['mcp__chrome-devtools', 'Read', 'Skill'],
      pluginDir,
    },
    {
      id: 'devtools',
      mcpServers: devtools,
      tools: '',
      allowedTools: ['mcp__chrome-devtools'],
    },
  ]
}
