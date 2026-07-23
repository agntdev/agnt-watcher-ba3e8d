import type { StorageAdapter } from "grammy";
import { MemorySessionStorage } from "./toolkit/session/memory.js";
import { defaultRedisStorage } from "./toolkit/session/redis.js";

export interface WatchlistItem {
  ticker: string;
  nickname?: string;
}

export interface ThresholdAlert {
  id: string;
  ticker: string;
  direction: "above" | "below";
  usd: number;
}

export interface PercentAlert {
  id: string;
  ticker: string;
  percent: number;
}

export interface UserData {
  profile: {
    userId: number;
    timezone?: string;
    language?: string;
    quietHours?: { start: string; end: string };
    morningTime?: string;
    summaryInQuiet?: boolean;
    lastMorning?: string; // YYYY-MM-DD last sent
  };
  watchlist: WatchlistItem[];
  thresholds: ThresholdAlert[];
  percents: PercentAlert[];
  lastPrices: Record<string, number>;
  lastAlertAt: Record<string, number>; // ruleKey -> epoch ms
  queuedAlerts: FiredAlert[];
}

export interface FiredAlert {
  ts: number;
  userId: number;
  ticker: string;
  rule: string;
  oldPrice: number;
  newPrice: number;
  pct: number;
}

export interface GlobalData {
  userIds: number[];
  recentFires: FiredAlert[];
}

const USER_PREFIX = "user:";
const GLOBAL_KEY = "global:stats";

let adapter: StorageAdapter<any> | null = null;

function getAdapter(): StorageAdapter<any> {
  if (!adapter) {
    const url = typeof process !== "undefined" ? process.env?.REDIS_URL : undefined;
    adapter = url ? defaultRedisStorage<any>(url) : new MemorySessionStorage<any>();
  }
  return adapter;
}

async function readUser(userId: number): Promise<UserData> {
  const a = getAdapter();
  const key = USER_PREFIX + userId;
  const data = await a.read(key);
  if (data) return data as UserData;
  return {
    profile: { userId },
    watchlist: [],
    thresholds: [],
    percents: [],
    lastPrices: {},
    lastAlertAt: {},
    queuedAlerts: [],
  };
}

async function writeUser(userId: number, data: UserData): Promise<void> {
  const a = getAdapter();
  const key = USER_PREFIX + userId;
  await a.write(key, data);
}

async function readGlobal(): Promise<GlobalData> {
  const a = getAdapter();
  const data = await a.read(GLOBAL_KEY);
  if (data) return data as GlobalData;
  return { userIds: [], recentFires: [] };
}

async function writeGlobal(data: GlobalData): Promise<void> {
  const a = getAdapter();
  await a.write(GLOBAL_KEY, data);
}

export async function ensureUserIndexed(userId: number): Promise<void> {
  const g = await readGlobal();
  if (!g.userIds.includes(userId)) {
    g.userIds.push(userId);
    await writeGlobal(g);
  }
}

export async function getActiveUserCount(): Promise<number> {
  const g = await readGlobal();
  return g.userIds.length;
}

export async function getProfile(userId: number): Promise<UserData["profile"]> {
  const u = await readUser(userId);
  return u.profile;
}

export async function saveProfile(userId: number, profile: Partial<UserData["profile"]>): Promise<void> {
  const u = await readUser(userId);
  u.profile = { ...u.profile, ...profile, userId };
  await writeUser(userId, u);
}

export async function getWatchlist(userId: number): Promise<WatchlistItem[]> {
  const u = await readUser(userId);
  return u.watchlist;
}

export async function addToWatchlist(userId: number, item: WatchlistItem): Promise<void> {
  const u = await readUser(userId);
  const exists = u.watchlist.findIndex((w) => w.ticker.toUpperCase() === item.ticker.toUpperCase());
  if (exists >= 0) {
    u.watchlist[exists] = { ...u.watchlist[exists], ...item };
  } else {
    u.watchlist.push({ ticker: item.ticker.toUpperCase(), nickname: item.nickname });
  }
  await writeUser(userId, u);
}

export async function removeFromWatchlist(userId: number, ticker: string): Promise<void> {
  const u = await readUser(userId);
  const t = ticker.toUpperCase();
  u.watchlist = u.watchlist.filter((w) => w.ticker !== t);
  u.thresholds = u.thresholds.filter((a) => a.ticker !== t);
  u.percents = u.percents.filter((a) => a.ticker !== t);
  delete u.lastPrices[t];
  // clean lastAlertAt for this ticker
  Object.keys(u.lastAlertAt).forEach((k) => {
    if (k.startsWith(t + ":")) delete u.lastAlertAt[k];
  });
  await writeUser(userId, u);
}

export async function getThresholdAlerts(userId: number): Promise<ThresholdAlert[]> {
  const u = await readUser(userId);
  return u.thresholds;
}

export async function addThresholdAlert(userId: number, alert: Omit<ThresholdAlert, "id">): Promise<ThresholdAlert> {
  const u = await readUser(userId);
  const id = `t:${Date.now()}:${alert.ticker}:${alert.direction}:${alert.usd}`;
  const full: ThresholdAlert = { id, ...alert };
  u.thresholds = u.thresholds.filter((a) => a.id !== id).concat(full);
  await writeUser(userId, u);
  return full;
}

export async function removeThresholdAlert(userId: number, id: string): Promise<void> {
  const u = await readUser(userId);
  u.thresholds = u.thresholds.filter((a) => a.id !== id);
  await writeUser(userId, u);
}

export async function getPercentAlerts(userId: number): Promise<PercentAlert[]> {
  const u = await readUser(userId);
  return u.percents;
}

export async function addPercentAlert(userId: number, alert: Omit<PercentAlert, "id">): Promise<PercentAlert> {
  const u = await readUser(userId);
  const id = `p:${Date.now()}:${alert.ticker}:${alert.percent}`;
  const full: PercentAlert = { id, ...alert };
  u.percents = u.percents.filter((a) => a.id !== id).concat(full);
  await writeUser(userId, u);
  return full;
}

export async function removePercentAlert(userId: number, id: string): Promise<void> {
  const u = await readUser(userId);
  u.percents = u.percents.filter((a) => a.id !== id);
  await writeUser(userId, u);
}

export async function getLastPrice(userId: number, ticker: string): Promise<number | undefined> {
  const u = await readUser(userId);
  return u.lastPrices[ticker.toUpperCase()];
}

export async function setLastPrice(userId: number, ticker: string, price: number): Promise<void> {
  const u = await readUser(userId);
  u.lastPrices[ticker.toUpperCase()] = price;
  await writeUser(userId, u);
}

export function makeRuleKey(type: "thresh" | "pct", detail: string): string {
  return `${type}:${detail}`;
}

export async function getLastAlertAt(userId: number, ruleKey: string): Promise<number | undefined> {
  const u = await readUser(userId);
  return u.lastAlertAt[ruleKey];
}

export async function setLastAlertAt(userId: number, ruleKey: string, at: number): Promise<void> {
  const u = await readUser(userId);
  u.lastAlertAt[ruleKey] = at;
  await writeUser(userId, u);
}

export async function recordFiredAlert(fire: FiredAlert): Promise<void> {
  const g = await readGlobal();
  g.recentFires.unshift(fire);
  if (g.recentFires.length > 50) g.recentFires.length = 50;
  await writeGlobal(g);
}

export async function getTopFires(limit = 10): Promise<FiredAlert[]> {
  const g = await readGlobal();
  // sort by count per rule? for now return recent, caller can aggregate if needed
  return g.recentFires.slice(0, limit);
}

export async function getAllFires(): Promise<FiredAlert[]> {
  const g = await readGlobal();
  return [...g.recentFires];
}

export async function getQueuedAlerts(userId: number): Promise<FiredAlert[]> {
  const u = await readUser(userId);
  return u.queuedAlerts || [];
}

export async function queueAlert(userId: number, fire: FiredAlert): Promise<void> {
  const u = await readUser(userId);
  u.queuedAlerts = u.queuedAlerts || [];
  u.queuedAlerts.push(fire);
  await writeUser(userId, u);
}

export async function clearQueuedAlerts(userId: number): Promise<FiredAlert[]> {
  const u = await readUser(userId);
  const q = u.queuedAlerts || [];
  u.queuedAlerts = [];
  await writeUser(userId, u);
  return q;
}
