export const hasNotification = () =>
  typeof window !== "undefined" && "Notification" in window;

export const getPermission = () => {
  if (!hasNotification()) return "unsupported";
  return Notification.permission; // default | granted | denied
};

export const requestPermission = async () => {
  if (!hasNotification()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
};

export const sendNotification = (title, body, iconEmoji = "✅") => {
  if (!hasNotification()) return null;
  if (Notification.permission !== "granted") return null;
  try {
    const iconSvg =
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${iconEmoji}</text></svg>`
      );
    const n = new Notification(title, {
      body,
      icon: iconSvg,
      badge: iconSvg,
      tag: "daymate-" + Date.now(),
      requireInteraction: false,
    });
    n.onclick = () => {
      try { window.focus(); } catch { /* ignore */ }
      try { n.close(); } catch { /* ignore */ }
    };
    return n;
  } catch {
    return null;
  }
};
