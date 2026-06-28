import { useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore from "../store/useStore";

const PRIORITIES = ["high", "medium", "low"];

const priorityColor = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-emerald-100 text-emerald-800",
};

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
    <div className="modal-overlay">
      <div className="modal-panel max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-ink">Manage Categories</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <form onSubmit={addCategory} className="space-y-3">
            <input
              type="text"
              placeholder="Category name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              required
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="input-field"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
            />
            <input
              type="text"
              placeholder="Keywords (comma separated)"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="input-field"
            />
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Creating..." : "Add Category"}
            </button>
          </form>

          {categories.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">Existing Categories</p>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between px-3 py-2.5 bg-surface rounded-lg border border-border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{cat.name}</p>
                    <span
                      className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded mt-1 ${
                        priorityColor[cat.priority] || priorityColor.low
                      }`}
                    >
                      {cat.priority}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteCategory(cat.id)}
                    className="text-xs text-red-600 hover:text-red-700 ml-2 shrink-0 font-medium"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
