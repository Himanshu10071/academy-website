"use client";

import type { CourseDetail, LecturePlayback } from "@academy/shared";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getCourse } from "../../lib/api/catalog";
import { getLecturePlayback } from "../../lib/api/playback";
import { Curriculum } from "../course/Curriculum";
import { GoogleSignIn } from "../layout/AcademyHeader";
import { useAccount } from "../layout/AccountProvider";
import { PlaybackVideo } from "./PlaybackVideo";

function LectureSidebar({ lecture }: { lecture: LecturePlayback["lecture"] }) {
  const [course, setCourse] = useState<CourseDetail>();
  const [unavailable, setUnavailable] = useState(false);
  const slug = lecture.courseSlug;

  useEffect(() => {
    let current = true;
    void getCourse(slug).then((result) => {
      if (current) setCourse(result);
    }).catch(() => {
      if (current) setUnavailable(true);
    });
    return () => { current = false; };
  }, [slug]);

  return <aside className="watch-curriculum" aria-labelledby="watch-curriculum">
    <h2 id="watch-curriculum">Curriculum</h2>
    {course && <>
      <Link className="catalog-back" href={`/courses/${slug}`}>{course.name}</Link>
      <Curriculum lectures={course.lectures} activeId={lecture.id} watchLinks />
    </>}
    {!course && (unavailable
      ? <p>The course curriculum is unavailable.</p>
      : <p role="status">Loading lessons…</p>)}
  </aside>;
}

export function WatchLecture({ lectureId }: { lectureId: string }) {
  const { token, userId, ready, accountError } = useAccount();
  return <main className="container sections watch-page">
    <section aria-labelledby="watch-heading">
      <Link className="catalog-back" href="/my-courses">← My Courses</Link>
      <h1 id="watch-heading">Watch lecture</h1>
      {!ready && <p role="status">{accountError || "Checking your account…"}</p>}
      {ready && !token && <div className="empty-state">
        <p>Sign in with Google to watch this lecture.</p><GoogleSignIn primary />
      </div>}
      {token && <PlaybackVideo key={`${userId}:${lectureId}`} label="Lecture video"
        load={(signal) => getLecturePlayback(lectureId, token, signal)}>
        {({ lecture }) => <div>
          <h2>{lecture.name}</h2>
          <LectureSidebar lecture={lecture} />
        </div>}
      </PlaybackVideo>}
    </section>
  </main>;
}
