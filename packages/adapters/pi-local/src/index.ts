export const type = "pi_local";
export const label = "Pi";

export const SANDBOX_INSTALL_COMMAND = "npm install -g @earendil-works/pi-coding-agent@0.74.0";

export const models: Array<{ id: string; label: string }> = [];

export const agentConfigurationDoc = `# pi_local agent configuration

Adapter: pi_local

Use when:
- You want Paperclip to run Pi (the AI coding agent) locally as the agent runtime
- You want provider/model routing in Pi format (--provider <name> --model <id>)
- You want Pi session resume across heartbeats via --session
- You need Pi's tool set (read, bash, edit, write, grep, find, ls)

Don't use when:
- You need webhook-style external invocation (use openclaw_gateway or http)
- You only need one-shot shell commands (use process)
- Pi CLI is not installed on the machine

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file appended to system prompt via --append-system-prompt
- promptTemplate (string, optional): user prompt template passed via -p flag
- model (string, required): Pi model id in provider/model format (for example xai/grok-4)
- thinking (string, optional): thinking level (off, minimal, low, medium, high, xhigh)
- command (string, optional): defaults to "pi"
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- Pi supports multiple providers and models. Use \`pi --list-models\` to list available options.
- Paperclip requires an explicit \`model\` value for \`pi_local\` agents.
- Sessions are stored in ~/.pi/paperclips/ and resumed with --session.
- All tools (read, bash, edit, write, grep, find, ls) are enabled by default.
- Agent instructions are appended to Pi's system prompt via --append-system-prompt, while the user task is sent via -p.
`;

export const ompAgentConfigurationDoc = `# omp_local agent configuration

Adapter: omp_local

Runs Oh My Pi (\`omp\`, a Pi fork) locally. It shares the pi_local adapter code and config fields:
cwd, instructionsFilePath, promptTemplate, model (required, provider/model), thinking, command
(defaults to "omp"), env, extraArgs, timeoutSec, graceSec.

Notes:
- Use \`omp models\` to list available models. Custom providers live in ~/.omp/agent/models.yml.
- PAPERCLIP_PI_PROVIDERS (Pi models.json "providers" shape) is written to a managed models.yml; that
  managed agent dir replaces ~/.omp/agent for the run, so host omp logins/config are not used then.
- Sessions are stored in ~/.omp/paperclips/ and resumed with --session <file>.
- Paperclip skills are linked into the agent dir's skills/ folder (omp has no --skill flag).
`;
