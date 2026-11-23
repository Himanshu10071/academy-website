import type { OwnedCourse } from "@academy/shared";
import { useEffect, useState } from "react";

import { listOwnedCourses } from "../lib/api/playback";

type Result = { token: string; courses?: OwnedCourse[]; failed?: true };

export function useOwnedCourses(token?: string) {
  const [result, setResult] = useState<Result>();
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void listOwnedCourses(token, controller.signal).then((courses) => {
      if (!controller.signal.aborted) setResult({ token, courses });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ token, failed: true });
    });
    return () => controller.abort();
  }, [token]);
  return result?.token === token ? result : undefined;
}
