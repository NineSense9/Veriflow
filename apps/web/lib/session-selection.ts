export type SessionSelection = {
  hasLatestRun: boolean;
};

/** Only an empty history should fall back to the demo case. */
export function shouldLoadDemoWhenOpening({ hasLatestRun }: SessionSelection) {
  return !hasLatestRun;
}
