# Working on AI Helper

- Keep credentials and outbound provider calls in Electron main. Renderer IPC must remain narrow and schema-validated.
- Generated code is a proposal. Preserve request-ID and code-version guards; never auto-apply AI output.
- Keep system-audio scope explicit. Test cancellation both before and after asynchronous setup.
- Behavioral answers must use supplied facts; never commit real résumés or fabricate achievements.
- For behavior changes, run `npm test`, `npm run typecheck`, and relevant browser flows. Run `npm run build` before pushing.
- Format with `npm run format`; do not hand-edit package-lock.json.
- Do not claim live Windows audio or provider compatibility from browser demo tests. Record the actual validation performed.
