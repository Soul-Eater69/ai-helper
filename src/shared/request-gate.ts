/** Invalidates asynchronous setup that began before a cancel or newer request. */
export class RequestGate {
  private epoch = 0;
  begin(): number {
    return ++this.epoch;
  }
  cancel(): void {
    this.epoch++;
  }
  isCurrent(ticket: number): boolean {
    return ticket === this.epoch;
  }
}
