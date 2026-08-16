import { useEffect, useState } from "react";

export function isPageVisible(visibilityState?: DocumentVisibilityState): boolean {
  return visibilityState !== "hidden";
}

export function usePageVisibility(): boolean {
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === "undefined" || isPageVisible(document.visibilityState)
  );

  useEffect(() => {
    const syncVisibility = () => setPageVisible(isPageVisible(document.visibilityState));
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  return pageVisible;
}
