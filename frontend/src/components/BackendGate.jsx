import { useBackendReady } from "../hooks/useBackendReady";
import ServerWakeScreen from "./ServerWakeScreen";

export default function BackendGate({ children }) {
  const { ready, checking } = useBackendReady();

  if (checking && !ready) {
    return <ServerWakeScreen />;
  }

  return children;
}
