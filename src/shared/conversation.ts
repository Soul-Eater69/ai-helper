/** Explicit spoken transitions only; ordinary follow-ups keep the workspace visible. */
export function startsNewProblem(question: string): boolean {
  return /\b(?:let(?:['’]s| us)\s+(?:(?:move|go|get)\s+(?:on\s+)?to|start|try|do)\s+(?:the\s+)?(?:a\s+)?(?:next|another|new)\s+(?:coding\s+)?(?:question|problem)|(?:next|new)\s+(?:coding\s+)?(?:question|problem)\s*[:.!?])/i.test(
    question,
  );
}
