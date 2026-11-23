"use client";

import type { PublicLecture } from "@academy/shared";
import Link from "next/link";

import { useOwnedCourses } from "../../hooks/use-owned-courses";
import { formatDuration } from "../../lib/catalog-format";
import { useAccount } from "../layout/AccountProvider";

export function Curriculum({ lectures, watchLinks, activeId }: {
  lectures: PublicLecture[]; watchLinks?: boolean; activeId?: string;
}) {
  if (!lectures.length) return <p className="empty-state">No lectures are listed yet.</p>;
  return <ol className="curriculum">
    {lectures.map((lecture) => {
      const label = `${lecture.lectureNumber}. ${lecture.name}`;
      const active = activeId === lecture.id;
      return <li key={lecture.id} value={lecture.lectureNumber} aria-current={active ? "step" : undefined}>
        <span>
          {watchLinks && !active
            ? <Link href={`/watch/${lecture.id}`}>{label}</Link>
            : <>{!watchLinks && <span className="curriculum-lock" role="img" aria-label="Locked">🔒</span>}{label}</>}
        </span>
        <span>{formatDuration(lecture.duration)}</span>
      </li>;
    })}
  </ol>;
}

export function CourseCurriculum({ courseId, lectures }: { courseId: string; lectures: PublicLecture[] }) {
  const { token } = useAccount();
  const ownership = useOwnedCourses(token);
  return <Curriculum lectures={lectures} watchLinks={ownership?.courses?.some((course) => course.id === courseId)} />;
}
