export const showBrowserNotification = async (
  title: string,
  body: string,
  url = "/",
  tag?: string,
) => {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  )
    return false;
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      try {
        await registration.showNotification(title, {
          body,
          icon: "/brand-logo.png",
          badge: "/brand-logo.png",
          data: { url },
          tag,
        });
        return true;
      } catch {
        // Fall back to the page notification when a browser does not support SW notifications.
      }
    }
    new Notification(title, { body, tag });
    return true;
  } catch {
    return false;
  }
};

export const openSyncChannel = (name: string) =>
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(name)
    : null;
