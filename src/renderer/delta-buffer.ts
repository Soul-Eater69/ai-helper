/** Coalesce small token events; at most one timer and one current response are retained. */
export class DeltaBuffer {
  private id = '';
  private text = '';
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private apply: (id: string, text: string) => void) {}
  push(id: string, text: string): void {
    if (id !== this.id) {
      this.clear();
      this.id = id;
    }
    this.text += text;
    this.timer ??= setTimeout(() => this.flush(), 32);
  }
  flush(): void {
    const { id, text } = this;
    this.clear();
    if (text) this.apply(id, text);
  }
  clear(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.text = '';
    this.id = '';
  }
}
