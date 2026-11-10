# Research and positioning

Snapshot date: 2026-11-11 (Asia/Shanghai).

All repository counts below are GitHub API snapshots from the surrounding research session. They indicate community attention, not product quality, and will change.

## Community shift

Recent personal-agent projects show two distinct waves:

1. **Capability growth.** Agent Skills, MCP servers, design/video/writing Skills, memory layers, hooks, and multi-agent harnesses multiplied quickly. Examples include [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model) (~17k stars), [KKKKhazix/human-writing](https://github.com/KKKKhazix/human-writing) (~4.5k), [anti-slop](https://github.com/miqdadbadjuber/anti-slop) (~8.9k), and [ffmpeg-skill](https://github.com/kajisho5/ffmpeg-skill) (~5k).
2. **Control and legibility.** Users began asking how to control scope, cost, attention, and configuration: [stop-that-shit](https://github.com/lennney/stop-that-shit) (~3.8k), [microsoft/TokenEconomizer](https://github.com/microsoft/TokenEconomizer) (~5.6k), [KKKKhazix/agent-autoloop](https://github.com/KKKKhazix/agent-autoloop) (~4.4k), and [Louis-CFM/coucou](https://github.com/Louis-CFM/coucou) (~7.1k).

The open opportunity is between those waves: **a personal, local tool that makes an existing pile of capabilities understandable and safely editable**. This is a second-order tool for the user, not another capability for the agent.

## Why not another report tool

The previous Proofpack experiment showed that a static report has weak user value when:

- the user must remember to run it;
- the result must be found, opened, and interpreted;
- it describes evidence but does not complete a task;
- the core architecture imposes a constraint, such as requiring a Git repository, that is unrelated to the user's problem.

`agent-tidy` therefore starts from a different contract: a scan is invisible when clean, and a finding is tied to a reversible action when actionable.

## Representative adjacent projects

| Project | What it does | Boundary from `agent-tidy` |
| --- | --- | --- |
| [alibaba/skill-up](https://github.com/alibaba/skill-up) (~1.5k) | Evaluation and evolution tool for Agent Skills | Targets Skill authors and evaluation workflows; we target an individual's active local setup |
| [mgechev/skillgrade](https://github.com/mgechev/skillgrade) (~737) | "Unit tests" for Agent Skills | Useful as a deterministic-check precedent; not a host configuration inventory or fix tool |
| [NVIDIA/SkillEvaluator](https://github.com/NVIDIA/SkillEvaluator) (~669) | Quality gates, semantic overlap detection, synthetic datasets, live agent evaluation | Heavier, evaluation-first framework; we avoid model calls and semantic claims in MVP |
| [EverMind-AI/SkillCorpus](https://github.com/EverMind-AI/SkillCorpus) (~701) | Turns scattered `SKILL.md` files into retrieval-ready corpora | Corpus and retrieval infrastructure; we focus on a personal machine's active configuration |
| [farion1231/cc-switch](https://github.com/farion1231/cc-switch) (~153k) | Cross-platform desktop assistant for provider, MCP, and Skills management | Broad desktop management surface; we want a small CLI/TUI with one core job |
| [rohitg00/skillkit](https://github.com/rohitg00/skillkit) (~1.6k) | Installs, translates, and shares portable Skills across many hosts | Installer/cross-host portability; we do not own installation in MVP |
| [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files) (~28k) | Persistent file-based plans and lifecycle hooks for long-running tasks | Shows the value of local, deterministic hooks; different problem domain |
| [FankChen/tracecrate](https://github.com/FankChen/tracecrate) (~195) | Privacy-first trace workbench and report export for past agent runs | Useful privacy and explicit-evidence model; still a read/analyze workbench |
| [lennney/stop-that-shit](https://github.com/lennney/stop-that-shit) (~3.8k) | Hook and Skill guard against scope creep and unrequested complexity | Strong product framing for a concrete pain; our checks are config hygiene, not behavior prompting |

## Existing categories we deliberately avoid

- **Memory and context engines:** [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) (~30k), [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) (~116k), [tigerless-labs/agent-memory](https://github.com/tigerless-labs/agent-memory) (~4.3k), and numerous SQLite/vector/knowledge-graph variants.
- **MCP directories and servers:** [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) (~98k) and adjacent catalogs.
- **Acceptance and evidence tools:** [Vibium](https://github.com/VibiumDev/vibium) (~3k), [lobehub/acceptance](https://github.com/lobehub/acceptance) (~96), [provepr](https://github.com/orvixx-labs/orvix-provepr) (~9), [doneguard](https://github.com/abranchesia/doneguard) (~8). These validate a code change; they do not manage local agent configuration.
- **Multi-agent desktops and orchestration:** [nightly-labs/openbot](https://github.com/nightly-labs/openbot) (~6.8k), [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) (~29k), and similar products.
- **Creative Skill collections:** a highly active but crowded category with weak technical differentiation for this project.

## Validation thesis

The strongest test is not a star count or an abstract benchmark. Run the first prototype against a real personal machine and verify:

1. It discovers an active Skill, duplicated MCP entry, missing path, or shadowed rule that the user did not know about.
2. The user chooses a fix without reading a long document.
3. A supported host sees the expected change.
4. `undo` restores the exact original bytes and permissions.
5. The command succeeds with networking disabled.

If those five things do not happen, the product should be narrowed or stopped rather than promoted.

## Sources and method

- GitHub repository search and metadata API, queried during the 2026-11-10/11 research session.
- Repository README files for the named projects, read to distinguish actual workflows from descriptions.
- Prior Proofpack implementation and usage discussion in this workspace, used only as a product lesson.

This document records a planning snapshot. Host behavior, config paths, and project activity must be rechecked before implementation.
