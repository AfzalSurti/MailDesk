import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore from "../store/useStore";

const ERROR_MESSAGES = {
  google_denied: "Google sign-in was cancelled",
  google_failed: "Google sign-in failed. Check redirect URI in Google Console.",
  account_conflict: "This email is linked to a different Google account",
  server_error: "Server error during sign-in. Database migration may be required.",
};

export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useStore((s) => s.setAuth);

  useEffect(() => {
    const token = params.get("token");
    const error = params.get("error");

    if (error) {
      toast.error(ERROR_MESSAGES[error] || "Sign-in failed");
      navigate("/login", { replace: true });
      return;
    }

    if (!token) {
      toast.error("Missing sign-in token");
      navigate("/login", { replace: true });
      return;
    }

    const finish = async () => {
      localStorage.setItem("token", token);
      try {
        const { data } = await api.get("/auth/me");
        setAuth(token, data);
        toast.success(`Welcome${data.name ? `, ${data.name}` : ""}!`);
        navigate("/dashboard", { replace: true });
      } catch {
        setAuth(token, null);
        toast.success("Signed in successfully");
        navigate("/dashboard", { replace: true });
      }
    };

    finish();
  }, [params, navigate, setAuth]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <p className="text-muted text-sm">Completing sign-in...</p>
    </div>
  );
}
