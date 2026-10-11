export const ioRedis = {
  status: undefined as string | undefined,
  eval: undefined as ((...args: unknown[]) => Promise<number>) | undefined,
  async set(): Promise<never> {
    throw new Error(
      'Test Redis storage is unavailable until explicitly supplied'
    );
  },
};
