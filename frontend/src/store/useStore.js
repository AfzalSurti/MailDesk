import { create } from "zustand";

const SELECTED_ACCOUNT_KEY = "selectedAccountId";
const USER_KEY = "user";

const useStore = create((set, get) => ({
  // Auth
  token: localStorage.getItem("token") || null,
  user: (() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })(),
  setAuth: (token, user) => {
    localStorage.setItem("token", token);
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
    localStorage.removeItem(SELECTED_ACCOUNT_KEY);
    set({
      token,
      user: user ?? null,
      accounts: [],
      categories: [],
      selectedAccount: null,
      emails: [],
      emailsByAccount: {},
      selectedEmailId: null,
      syncingAccountIds: {},
      recategorizingAccountIds: {},
      emailsLoading: false,
    });
  },
  setToken: (token) => {
    localStorage.setItem("token", token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SELECTED_ACCOUNT_KEY);
    set({
      token: null,
      user: null,
      accounts: [],
      categories: [],
      selectedAccount: null,
      emails: [],
      emailsByAccount: {},
      selectedEmailId: null,
      syncingAccountIds: {},
      recategorizingAccountIds: {},
      emailsLoading: false,
    });
  },

  accounts: [],
  setAccounts: (accounts) => set({ accounts }),
  selectedAccount: null,
  setSelectedAccount: (account) => {
    if (account?.id) {
      localStorage.setItem(SELECTED_ACCOUNT_KEY, account.id);
    } else {
      localStorage.removeItem(SELECTED_ACCOUNT_KEY);
    }
    const cached = account?.id ? get().emailsByAccount[account.id] : null;
    set({
      selectedAccount: account,
      emails: cached || [],
      selectedEmailId: null,
    });
  },

  categories: [],
  setCategories: (categories) => set({ categories }),

  emails: [],
  emailsByAccount: {},
  setEmailsForAccount: (accountId, emails) => {
    const selectedId = get().selectedAccount?.id;
    set((state) => ({
      emailsByAccount: { ...state.emailsByAccount, [accountId]: emails },
      // Only update visible inbox if this account is still selected
      emails: selectedId === accountId ? emails : state.emails,
    }));
  },
  setEmails: (emails) => {
    const accountId = get().selectedAccount?.id;
    if (!accountId) {
      set({ emails });
      return;
    }
    get().setEmailsForAccount(accountId, emails);
  },
  selectedEmailId: null,
  setSelectedEmailId: (id) => set({ selectedEmailId: id }),
  emailsLoading: false,
  setEmailsLoading: (val) => set({ emailsLoading: val }),

  // Per-account busy flags — syncing A must not show spinner on B
  syncingAccountIds: {},
  setAccountSyncing: (accountId, busy) =>
    set((state) => ({
      syncingAccountIds: { ...state.syncingAccountIds, [accountId]: busy },
    })),
  recategorizingAccountIds: {},
  setAccountRecategorizing: (accountId, busy) =>
    set((state) => ({
      recategorizingAccountIds: {
        ...state.recategorizingAccountIds,
        [accountId]: busy,
      },
    })),
}));

export default useStore;

export function getSavedAccountId() {
  return localStorage.getItem(SELECTED_ACCOUNT_KEY);
}

export function selectEmailById(emails, selectedEmailId) {
  if (!selectedEmailId) return null;
  return emails.find((e) => e.id === selectedEmailId) ?? null;
}

export function isAccountSyncing(state, accountId) {
  return Boolean(accountId && state.syncingAccountIds?.[accountId]);
}

export function isAccountRecategorizing(state, accountId) {
  return Boolean(accountId && state.recategorizingAccountIds?.[accountId]);
}
