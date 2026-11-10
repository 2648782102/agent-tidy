# Contributing

The repository has a pre-release CLI. Code contributions are welcome when they are small, deterministic, and easy to review.

Before opening a pull request, run `npm run check`. Every new check needs a deterministic fixture and a documented false-positive limit. Every new fix needs an undo test and a privacy review.

Useful contributions:

- corrections to product scope, research snapshots, or host facts;
- reproducible examples of confusing personal Skill, MCP, hook, plugin, or instruction configurations;
- false-positive and false-negative risks for proposed deterministic checks;
- privacy and undo-safety concerns;
- examples of clean, compact CLI output;
- pointers to prior art with a clear explanation of the difference.
- adapter fixtures for new host versions.

Please do not submit:

- real personal configuration, tokens, keys, session transcripts, or transaction logs;
- a new Skill catalog or MCP server;
- generated marketing copy, star-growth tactics, or directory submissions;
- code that executes discovered commands or installers;
- automatic file deletion or cloud sync;
- an LLM-based "quality score" for the first version.

See [DEVELOPMENT.md](DEVELOPMENT.md) for the workflow and testing expectations.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
