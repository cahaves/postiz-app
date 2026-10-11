export class LeaseRedis {
  status = 'ready';
  data = new Map<string, { value: string; expires: number }>();
  fail = false;
  async set(
    key: string,
    value: string,
    px: string,
    ttl: number,
    nx: string
  ): Promise<'OK' | null> {
    if (this.fail || px !== 'PX' || nx !== 'NX')
      throw new Error('Storage unavailable');
    if (this.data.has(key) && this.data.get(key).expires > Date.now())
      return null;
    this.data.set(key, { value, expires: Date.now() + ttl });
    return 'OK';
  }
  async eval(
    script: string,
    count: number,
    key: string,
    token: string
  ): Promise<number> {
    if (this.fail || count !== 1 || !script.includes("redis.call('get'"))
      throw new Error('Storage unavailable');
    if (
      this.data.get(key)?.value === token &&
      this.data.get(key).expires > Date.now()
    ) {
      this.data.delete(key);
      return 1;
    }
    return 0;
  }
}
