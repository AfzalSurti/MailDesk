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
    set({ token: null, selectedAccount: null, emails: [], selectedEmail: null });
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
    set({ selectedAccount: account, emails: [], selectedEmail: null });
  },

  // Categories
  categories: [],
  setCategories: (categories) => set({ categories }),

  // Emails
  emails: [],
  setEmails: (emails) => set({ emails }),
  selectedEmail: null,
  setSelectedEmail: (email) => set({ selectedEmail: email }),
  emailsLoading: false,
  setEmailsLoading: (val) => set({ emailsLoading: val }),
}));

export default useStore;

export function getSavedAccountId() {
  return localStorage.getItem(SELECTED_ACCOUNT_KEY);
}
