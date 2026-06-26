import { create } from "zustand";

const useStore = create((set) => ({
  // Auth
  token: localStorage.getItem("token") || null,
  setToken: (token) => {
    localStorage.setItem("token", token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem("token");
    set({ token: null, selectedAccount: null, emails: [] });
  },

  // Accounts
  accounts: [],
  setAccounts: (accounts) => set({ accounts }),
  selectedAccount: null,
  setSelectedAccount: (account) => set({ selectedAccount: account, emails: [] }),

  // Categories
  categories: [],
  setCategories: (categories) => set({ categories }),

  // Emails
  emails: [],
  setEmails: (emails) => set({ emails }),
  emailsLoading: false,
  setEmailsLoading: (val) => set({ emailsLoading: val }),
}));

export default useStore;