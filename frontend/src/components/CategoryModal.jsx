import { useEffect, useMemo, useState } from "react";
import { CheckSquare, RefreshCw, Sparkles, Tag, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore from "../store/useStore";
import Modal from "./ui/Modal";
import EmptyState from "./ui/EmptyState";
import { PRIORITIES, PRIORITY_COLORS } from "../constants/categories";

function toggleId(items, id) {
  return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
}

export default function CategoryModal({
  onClose,
  selectedAccount,
  onRecategorizeAll,
  recategorizing,
  syncing,
}) {
  const { accounts, categories, setCategories } = useStore();
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingAccountIds, setEditingAccountIds] = useState([]);
  const [savingAssignmentId, setSavingAssignmentId] = useState(null);

  const allAccountIds = useMemo(() => accounts.map((account) => account.id), [accounts]);

  useEffect(() => {
    if (selectedAccount?.id) {
      setSelectedAccountIds([selectedAccount.id]);
    } else {
      setSelectedAccountIds(allAccountIds);
    }
  }, [selectedAccount?.id, allAccountIds]);

  useEffect(() => {
    const loadCategories = async () => {
      setFetching(true);
      try {
        const { data } = await api.get("/categories/", {
          params: selectedAccount?.id ? { account_id: selectedAccount.id } : {},
        });
        setCategories(data);
      } catch {
        toast.error("Failed to load categories");
      } finally {
        setFetching(false);
      }
    };
    loadCategories();
  }, [selectedAccount?.id, setCategories]);

  const addCategory = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/categories/", {
        name,
        priority,
        description: description || undefined,
        keywords: keywords
          ? keywords.split(",").map((k) => k.trim()).filter(Boolean)
          : [],
        account_ids: selectedAccountIds,
      });
      const created = {
        ...data,
        assigned: selectedAccountIds.includes(selectedAccount?.id),
      };
      setCategories([...categories, created]);
      toast.success("Category created");
      setName("");
      setDescription("");
      setKeywords("");
      setSelectedAccountIds(selectedAccount?.id ? [selectedAccount.id] : allAccountIds);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create category");
    } finally {
      setLoading(false);
    }
  };

  const deleteCategory = async (id) => {
    try {
      await api.delete(`/categories/${id}`);
      setCategories(categories.filter((c) => c.id !== id));
      toast.success("Category deleted");
    } catch {
      toast.error("Failed to delete category");
    }
  };

  const startEditingAssignments = (category) => {
    setEditingCategoryId(category.id);
    setEditingAccountIds(category.assigned_account_ids || []);
  };

  const saveAssignments = async (categoryId) => {
    setSavingAssignmentId(categoryId);
    try {
      const { data } = await api.put(`/categories/${categoryId}/accounts`, {
        account_ids: editingAccountIds,
      });
      setCategories(
        categories.map((category) =>
          category.id === categoryId
            ? {
                ...category,
                ...data,
                assigned: editingAccountIds.includes(selectedAccount?.id),
              }
            : {
                ...category,
                assigned:
                  category.id === categoryId
                    ? editingAccountIds.includes(selectedAccount?.id)
                    : category.assigned,
              }
        )
      );
      toast.success("Category assignment updated");
      setEditingCategoryId(null);
      setEditingAccountIds([]);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save category assignment");
    } finally {
      setSavingAssignmentId(null);
    }
  };

  return (
    <Modal title="Manage Categories" onClose={onClose}>
      <div className="space-y-8">
        <section>
          <h3 className="text-sm font-semibold text-ink mb-1">New Category</h3>
          <p className="text-xs text-muted mb-4">
            Create a category, then choose which inbox accounts it should apply to.
          </p>
          <form onSubmit={addCategory} className="space-y-3">
            <div>
              <label className="field-label">Name</label>
              <input
                type="text"
                placeholder="e.g. Invoices, Support, Urgent"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="field-label">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="input-field"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Description (optional)</label>
              <input
                type="text"
                placeholder="What kind of emails belong here?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="field-label">Keywords (optional)</label>
              <input
                type="text"
                placeholder="invoice, payment, bill"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="field-label mb-0">Apply to accounts</label>
                <button
                  type="button"
                  onClick={() => setSelectedAccountIds(allAccountIds)}
                  className="text-[11px] text-accent hover:text-accent-hover font-medium"
                >
                  Select all
                </button>
              </div>
              <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
                {accounts.map((account) => (
                  <label key={account.id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={selectedAccountIds.includes(account.id)}
                      onChange={() =>
                        setSelectedAccountIds((prev) => toggleId(prev, account.id))
                      }
                    />
                    <span>{account.display_name || account.email_address}</span>
                  </label>
                ))}
                {accounts.length === 0 && (
                  <p className="text-xs text-muted">Add an inbox account first.</p>
                )}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || accounts.length === 0 || selectedAccountIds.length === 0}
              className="btn-primary w-full"
            >
              {loading ? "Creating..." : "Add Category"}
            </button>
          </form>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink mb-3">
            Existing ({categories.length})
          </h3>
          {fetching ? (
            <p className="text-sm text-muted text-center py-4">Loading categories...</p>
          ) : categories.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No categories yet"
              description="Create categories so AI can classify your emails."
              compact
            />
          ) : (
            <div className="space-y-3">
              {categories.map((cat) => (
                <div key={cat.id} className="list-item flex-col items-stretch">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink truncate">{cat.name}</p>
                        {selectedAccount && cat.assigned && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-accent/10 text-accent">
                            Active for this inbox
                          </span>
                        )}
                      </div>
                      {cat.description && (
                        <p className="text-xs text-muted mt-0.5">{cat.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span
                          className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${
                            PRIORITY_COLORS[cat.priority] || PRIORITY_COLORS.low
                          }`}
                        >
                          {cat.priority}
                        </span>
                        <span className="text-[11px] text-muted">
                          Applied to {cat.assigned_account_ids?.length || 0} account(s)
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteCategory(cat.id)}
                      className="p-2 text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      aria-label="Delete category"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-3 rounded-xl border border-border/80 bg-card p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-xs font-medium text-muted">Account assignment</p>
                      {editingCategoryId === cat.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingAccountIds(allAccountIds)}
                            className="text-[11px] text-accent hover:text-accent-hover font-medium"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => saveAssignments(cat.id)}
                            disabled={savingAssignmentId === cat.id}
                            className="text-[11px] text-accent hover:text-accent-hover font-medium"
                          >
                            {savingAssignmentId === cat.id ? "Saving..." : "Save"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditingAssignments(cat)}
                          className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover font-medium"
                        >
                          <CheckSquare className="w-3 h-3" />
                          Edit accounts
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {accounts.map((account) => {
                        const activeIds =
                          editingCategoryId === cat.id
                            ? editingAccountIds
                            : cat.assigned_account_ids || [];
                        return (
                          <label
                            key={account.id}
                            className="flex items-center gap-2 text-sm text-ink"
                          >
                            <input
                              type="checkbox"
                              checked={activeIds.includes(account.id)}
                              disabled={editingCategoryId !== cat.id}
                              onChange={() =>
                                setEditingAccountIds((prev) => toggleId(prev, account.id))
                              }
                            />
                            <span>{account.display_name || account.email_address}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border-t border-border pt-6">
          <h3 className="text-sm font-semibold text-ink mb-1">Bulk re-categorization</h3>
          <p className="text-xs text-muted mb-4 leading-relaxed">
            Re-run AI only with the categories assigned to the selected inbox.
          </p>
          <button
            type="button"
            onClick={onRecategorizeAll}
            disabled={!selectedAccount || recategorizing || syncing}
            className="btn-secondary w-full inline-flex items-center justify-center gap-2"
          >
            {(recategorizing || syncing) && (
              <RefreshCw className="w-4 h-4 animate-spin" />
            )}
            <Sparkles className="w-4 h-4" />
            {recategorizing ? "Re-categorizing all emails..." : "Re-categorize all emails"}
          </button>
        </section>
      </div>
    </Modal>
  );
}
