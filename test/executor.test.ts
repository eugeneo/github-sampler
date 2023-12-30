import Executor from "../src/executor";

describe("Executor", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  it("throttles operations to 3 per second", async () => {
    let calls = 0;
    const throttle = new Executor({ qps: 3 });
    const promises: Promise<number>[] = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        throttle.schedule(async () => {
          calls++;
          return i;
        })
      );
    }
    await Promise.resolve();
    expect(calls).toBe(1);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(calls).toBe(3);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await expect(Promise.all(promises)).resolves.toEqual([0, 1, 2, 3, 4]);
  });

  it("exception does not affect next operation", async () => {
    const throttle = new Executor({ qps: 3 });
    const promises: Promise<number>[] = [];
    for (let i = 0; i < 3; i++) {
      promises.push(
        throttle.schedule(async () => {
          if (i === 1) {
            throw new Error("boop");
          }
          return i + 1;
        })
      );
    }
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await expect(promises[0]).resolves.toEqual(1);
    await expect(promises[1]).rejects.toEqual(new Error("boop"));
    await expect(promises[2]).resolves.toEqual(3);
  });
});
