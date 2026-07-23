let clock: () => Date = () => new Date();

export function now(): Date {
  return clock();
}

export function setNow(fn: () => Date): void {
  clock = fn;
}

export function resetNow(): void {
  clock = () => new Date();
}

// For tests that need to control "today" for morning etc. Pass epoch ms or Date.
export function setNowMs(ms: number): void {
  clock = () => new Date(ms);
}
