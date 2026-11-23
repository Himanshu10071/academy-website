import { WatchLecture } from "../../../../components/player/WatchLecture";

export default async function WatchPage({ params }: { params: Promise<{ lectureId: string }> }) {
  const { lectureId } = await params;
  return <WatchLecture lectureId={lectureId} />;
}
