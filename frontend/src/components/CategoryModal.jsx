import { useState } from "react";
import { Tag, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore from "../store/useStore";
import Modal from "./ui/Modal";
import EmptyState from "./ui/EmptyState";
import { PRIORITIES, PRIORITY_COLORS } from "../constants/categories";

export default function CategoryModal({ onClose }) {
  const { categories, setCategories } = useStore();
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [loading, setLoading] = useState(false);

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
      });
      setCategories([...categories, data]);
      toast.success("Category created");
      setName("");
      setDescription("");
      setKeywords("");
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

  return (
    <Modal title="Manage Categories" onClose={onClose}>
      <div className="space-y-8">
        <section>
          <h3 className="text-sm font-semibold text-ink mb-1">New Category</h3>
          <p className="text-xs text-muted mb-4">
            Categories help AI sort incoming emails by type and priority.
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
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Creating..." : "Add Category"}
            </button>
          </form>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink mb-3">
            Existing ({categories.length})
          </h3>
          {categories.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No categories yet"
              description="Create categories so AI can classify your emails."
              compact
            />
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="list-item">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{cat.name}</p>
                    {cat.description && (
                      <p className="text-xs text-muted truncate mt-0.5">{cat.description}</p>
                    )}
                    <span
                      className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded mt-1.5 ${
                        PRIORITY_COLORS[cat.priority] || PRIORITY_COLORS.low
                      }`}
                    >
                      {cat.priority}
                    </span>
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
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
