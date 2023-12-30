export default class Executor {
  constructor(private readonly config: { qps: number }) {}

  async schedule<Result>(operation: () => Promise<Result>): Promise<Result> {
    await this.nextSlot();
    return await operation();
  }

  nextSlot(): Promise<void> {
    const now = Date.now();
    const nextSlot = Math.ceil(this.lastSlot + 1000 / this.config.qps);
    if (nextSlot > now) {
      this.lastSlot = nextSlot;
      return new Promise((resolve) => setTimeout(resolve, nextSlot - now));
    } else {
      this.lastSlot = now;
      return Promise.resolve();
    }
  }

  private lastSlot: number = 0;
}
