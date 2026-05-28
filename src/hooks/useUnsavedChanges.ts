import { useEffect, useRef } from "react";

/**
 * Warns the user before they leave a route with unsaved changes.
 * Frontend-only: native `beforeunload` for tab close/reload,
 * and a confirm() guard for in-app navigation via popstate.
 */
export function useUnsavedChanges(dirty: boolean, message = "لديك تغييرات غير محفوظة. هل تريد المغادرة؟") {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [message]);
}
