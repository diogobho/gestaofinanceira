import axios from 'axios';
import { env } from '../../config/env';

const BASE = 'https://api.pluggy.ai';

let _apiKey: string | null = null;
let _keyExpiry = 0;

async function getApiKey(): Promise<string> {
  if (_apiKey && Date.now() < _keyExpiry) return _apiKey;

  const res = await axios.post(`${BASE}/auth`, {
    clientId: env.PLUGGY_CLIENT_ID,
    clientSecret: env.PLUGGY_CLIENT_SECRET,
  });

  _apiKey = res.data.apiKey as string;
  _keyExpiry = Date.now() + 90 * 60 * 1000; // cache 90 min (token dura 120)
  return _apiKey;
}

function authHeaders(apiKey: string) {
  return { 'X-API-KEY': apiKey };
}

export interface PluggyItem {
  id: string;
  connector: { name: string; institutionUrl?: string; imageUrl?: string };
  status: string; // UPDATED | UPDATING | LOGIN_ERROR | WAITING_USER_INPUT
  createdAt: string;
  updatedAt: string;
}

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: 'BANK' | 'CREDIT';
  subtype: string;
  name: string;
  marketingName?: string;
  balance: number;
  currencyCode: string;
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  description: string;
  descriptionRaw?: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  date: string;
  category?: string;
  categoryId?: string;
  balance?: number;
  currencyCode?: string;
  status: 'POSTED' | 'PENDING';
}

export const pluggyClient = {
  async createConnectToken(clientUserId: string): Promise<string> {
    const apiKey = await getApiKey();
    const res = await axios.post(
      `${BASE}/connect_token`,
      { options: { clientUserId } },
      { headers: authHeaders(apiKey) }
    );
    return res.data.accessToken as string;
  },

  async getItem(itemId: string): Promise<PluggyItem> {
    const apiKey = await getApiKey();
    const res = await axios.get(`${BASE}/items/${itemId}`, { headers: authHeaders(apiKey) });
    return res.data as PluggyItem;
  },

  async listAccounts(itemId: string): Promise<PluggyAccount[]> {
    const apiKey = await getApiKey();
    const res = await axios.get(`${BASE}/accounts`, {
      params: { itemId },
      headers: authHeaders(apiKey),
    });
    return (res.data.results ?? []) as PluggyAccount[];
  },

  async listTransactions(accountId: string, from?: string, to?: string): Promise<PluggyTransaction[]> {
    const apiKey = await getApiKey();
    const all: PluggyTransaction[] = [];
    let page = 1;

    while (true) {
      const res = await axios.get(`${BASE}/transactions`, {
        params: { accountId, page, pageSize: 500, ...(from && { from }), ...(to && { to }) },
        headers: authHeaders(apiKey),
      });
      const { results, totalPages } = res.data;
      all.push(...(results as PluggyTransaction[]));
      if (page >= (totalPages ?? 1)) break;
      page++;
    }

    return all;
  },
};
