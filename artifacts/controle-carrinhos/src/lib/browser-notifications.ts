export const showBrowserNotification = async (
  title: string,
  body: string,
  url = "/",
) => {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      try {
        await registration.showNotification(title, {
          body,
          icon: "/agenda-adventista-icon.png",
          badge: "/agenda-adventista-icon.png",
          data: { url },
        });
        return true;
      } catch {
        // Fall back to the page notification when a browser does not support SW notifications.
      }
    }
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
};

export const openSyncChannel = (name: string) =>
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(name)
    : null;
