# Security and data handling

Report vulnerabilities privately to the repository owner through an available private contact channel. Do not post real API keys, session transcripts, résumé details, or vault files in public issues.

## Trust boundaries

- Renderer: sandboxed, context isolated, Node disabled, restrictive CSP, no arbitrary IPC or external navigation.
- Main process: schema-checks inputs, checks the sending frame, owns API credentials, makes requests only to fixed OpenAI endpoints.
- Storage: entire vault encrypted with Windows OS-backed `safeStorage`, serialized writes, atomic replacement; damaged storage errors rather than being silently replaced.
- Capture: begins only after the user requests it. Permission is short lived. Audio is not written to disk. System loopback captures all playback, not just a selected app.
- Output: Markdown does not render raw HTML or remote images; generated code is not executed. Code acceptance validates the editor version.

Custom prompts and experience facts are sent to the model and should not contain secrets. `store: false` disables Responses application-state storage; it is not a claim of zero provider retention. OpenAI account settings and data policies apply.

## Release hardening

Before production deployment, validate live audio on supported Windows versions, assess provider data policies, run dependency review, sign installers with your own certificate, and verify signing in release automation. The included installer is unsigned. No automatic update or telemetry service is enabled.
