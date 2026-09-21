interface Item {
  id: string;
  previous: string | null;
  final?: string;
}
export class TranscriptBuffer {
  private items = new Map<string, Item>();
  private delivered = new Set<string>();
  private deliveredOrder: string[] = [];
  commit(id: string, previous: string | null): void {
    if (!this.items.has(id) && !this.delivered.has(id)) this.items.set(id, { id, previous });
  }
  finish(id: string, text: string): { id: string; text: string }[] {
    if (this.delivered.has(id)) return [];
    const item = this.items.get(id) ?? { id, previous: null };
    item.final = text;
    this.items.set(id, item);
    const ready: { id: string; text: string }[] = [];
    let progress = true;
    while (progress) {
      progress = false;
      for (const next of this.items.values()) {
        if (next.final === undefined || (next.previous && this.items.has(next.previous))) continue;
        this.items.delete(next.id);
        this.delivered.add(next.id);
        this.deliveredOrder.push(next.id);
        if (next.final.trim()) ready.push({ id: next.id, text: next.final });
        progress = true;
      }
    }
    while (this.deliveredOrder.length > 500) this.delivered.delete(this.deliveredOrder.shift()!);
    return ready;
  }
}
export function shouldAnswer(text: string, awaitingClarification: boolean): boolean {
  const clean = text.trim();
  if (!clean || /^(um|uh|hmm|thanks|thank you|okay|ok|yeah)[.!\s]*$/i.test(clean)) return false;
  return (
    awaitingClarification ||
    /\?|\b(what|why|how|when|where|which|who|design|implement|write|explain|tell me|walk me|change|modify|instead|optimi[sz]e|return|find|solve|could you|can you|would you)\b/i.test(
      clean,
    )
  );
}
