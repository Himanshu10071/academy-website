export type PlaybackSource = { url: string; expiresAt: string };
export type LecturePlayback = PlaybackSource & {
  lecture: { id: string; name: string; courseId: string; courseSlug: string };
};
export type DemoPlayback = PlaybackSource & { demo: { id: string; name: string } };
export type OwnedCourse = {
  id: string;
  name: string;
  slug: string;
  thumbnailUrl: string | null;
  teacherName: string;
  lectureCount: number;
};
