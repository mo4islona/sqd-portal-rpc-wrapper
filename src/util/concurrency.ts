export class ConcurrencyLimiter {
  private current = 0;

  constructor(private readonly limit: number) {}

  tryAcquire(): (() => void) | null {
    if (this.current >= this.limit) {
      return null;
    }
    this.current += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.current = Math.max(0, this.current - 1);
    };
  }
}
