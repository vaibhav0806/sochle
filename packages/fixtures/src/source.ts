type FixtureSourceOptions<T> = {
  demoLoader: () => Promise<T>;
  demoMode: boolean;
  liveLoader: () => Promise<T>;
};

export function loadFixtureSource<T>({
  demoLoader,
  demoMode,
  liveLoader,
}: FixtureSourceOptions<T>): Promise<T> {
  return demoMode ? demoLoader() : liveLoader();
}
