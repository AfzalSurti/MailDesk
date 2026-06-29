import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore from "../store/useStore";
import AuthLayout from "../components/auth/AuthLayout";
import GoogleSignInButton from "../components/auth/GoogleSignInButton";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useStore((s) => s.setAuth);
  const token = useStore((s) => s.token);
  const navigate = useNavigate();

  if (token) return <Navigate to="/dashboard" replace />;

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/auth/signup", {
        name: name.trim(),
        email,
        password,
      });
      setAuth(data.access_token, data.user);
      toast.success(`Welcome, ${data.user.name}!`);
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create account" subtitle="Sign up with your Gmail and a password">
      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="field-label">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Afzal Surti"
            className="input-field"
            required
          />
        </div>
        <div>
          <label className="field-label">Gmail address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gmail.com"
            className="input-field"
            required
          />
        </div>
        <div>
          <label className="field-label">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="input-field"
            minLength={8}
            required
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full font-semibold py-2.5">
          {loading ? "Creating account..." : "Sign Up"}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-2 text-muted">or</span>
        </div>
      </div>

      <GoogleSignInButton disabled={loading} />

      <p className="text-center text-sm text-muted mt-6">
        Already have an account?{" "}
        <Link to="/login" className="text-accent hover:text-accent-hover font-medium">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
