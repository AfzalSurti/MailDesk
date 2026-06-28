import { create } from "zustand";

const SELECTED_ACCOUNT_KEY = "selectedAccountId";

const useStore = create((set) => ({
  // Auth
  token: localStorage.getItem("token") || null,
  setToken: (token) => {
    localStorage.setItem("token", token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem(SELECTED_ACCOUNT_KEY);
    set({
      token: null,
      selectedAccount: null,
      emails: [],
      selectedEmailId: null,
      emailsSyncing: false,
      emailsRecategorizing: false,
    });
  },

  // Accounts
  accounts: [],
  setAccounts: (accounts) => set({ accounts }),
  selectedAccount: null,
  setSelectedAccount: (account) => {
    if (account?.id) {
      localStorage.setItem(SELECTED_ACCOUNT_KEY, account.id);
    } else {
      localStorage.removeItem(SELECTED_ACCOUNT_KEY);
    }
    set({ selectedAccount: account, emails: [], selectedEmailId: null });
  },

  // Categories
  categories: [],
  setCategories: (categories) => set({ categories }),

  // Emails — track selection by ID so polling never shows stale/wrong content
  emails: [],
  setEmails: (emails) => set({ emails }),
  selectedEmailId: null,
  setSelectedEmailId: (id) => set({ selectedEmailId: id }),
  emailsLoading: false,
  setEmailsLoading: (val) => set({ emailsLoading: val }),
  emailsSyncing: false,
  setEmailsSyncing: (val) => set({ emailsSyncing: val }),
  emailsRecategorizing: false,
  setEmailsRecategorizing: (val) => set({ emailsRecategorizing: val }),
}));

export default useStore;

export function getSavedAccountId() {
  return localStorage.getItem(SELECTED_ACCOUNT_KEY);
}

export function selectEmailById(emails, selectedEmailId) {
  if (!selectedEmailId) return null;
  return emails.find((e) => e.id === selectedEmailId) ?? null;
}
