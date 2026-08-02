export type HostConnectionStatus = "online" | "unstable" | "reconnecting" | "offline";
export type HostSyncStatus = "current" | "catching_up" | "stale";

export type HostRecoveryView = {
  label: string;
  message: string;
  tone: "success" | "warning" | "error";
};

export function isHostConsoleCurrent(connection: HostConnectionStatus, sync: HostSyncStatus): boolean {
  return connection === "online" && sync === "current";
}

export function getHostRecoveryView(connection: HostConnectionStatus, sync: HostSyncStatus): HostRecoveryView {
  if (connection === "online" && sync === "current") {
    return { label: "Connected", message: "Connected.", tone: "success" };
  }
  if (connection === "online") {
    return {
      label: "Catching up",
      message: "Getting the tasting’s current state. Commands are paused until it is confirmed.",
      tone: "warning"
    };
  }
  if (connection === "unstable") {
    return {
      label: "Connection patchy",
      message: "Your connection is patchy. Commands are paused while we confirm the tasting’s current state.",
      tone: "warning"
    };
  }
  if (connection === "offline") {
    return {
      label: "Offline",
      message: "We’ve lost our connection to this tasting. Your guests are seeing nothing change.",
      tone: "error"
    };
  }
  return {
    label: "Reconnecting",
    message: "Reconnecting. Nothing has changed for your guests.",
    tone: "warning"
  };
}
