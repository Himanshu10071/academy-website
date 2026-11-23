import type { PublicCourse, PublicDemo } from "@academy/shared";
import Link from "next/link";

import { formatDuration, formatPrice } from "../../lib/catalog-format";
import { PlayDemo } from "../player/PlayDemo";

export function CatalogImage({ url }: { url: string | null }) {
  if (!url) return <div className="catalog-image catalog-image-placeholder" aria-hidden="true" />;
  // Admins can enter ordinary image URLs from different hosts.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="catalog-image" loading="lazy" referrerPolicy="no-referrer" />;
}

export function CourseCard({ course }: { course: PublicCourse }) {
  return (
    <Link className="catalog-card" href={`/courses/${course.slug}`}>
      <CatalogImage url={course.thumbnailUrl} />
      <div className="catalog-card-body">
        <h3>{course.name}</h3>
        <p>{course.teacher.name}</p>
        <div className="catalog-card-meta"><span>{course.lectureCount} lectures</span><strong>{formatPrice(course.pricePaise)}</strong></div>
      </div>
    </Link>
  );
}

export function DemoCard({ demo }: { demo: PublicDemo }) {
  return (
    <article className="catalog-card">
      <CatalogImage url={demo.thumbnailUrl} />
      <div className="catalog-card-body">
        <h3>{demo.name}</h3>
        {demo.description && <p>{demo.description}</p>}
        <div className="catalog-card-meta">{formatDuration(demo.duration)}</div>
        <PlayDemo id={demo.id} name={demo.name} />
      </div>
    </article>
  );
}
