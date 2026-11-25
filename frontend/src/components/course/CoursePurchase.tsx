"use client";

import { ROLE, type PublicCourse } from "@academy/shared";
import Link from "next/link";

import { useOwnedCourses } from "../../hooks/use-owned-courses";
import { formatPrice } from "../../lib/catalog-format";
import { useAccount } from "../layout/AccountProvider";

export function CoursePurchase({ course }: { course: Pick<PublicCourse, "id" | "slug" | "pricePaise"> }) {
  const { ready, signedIn, token, profile, accountError, busy, signIn, edit } = useAccount();
  const ownership = useOwnedCourses(token);

  if (accountError && (!ready || (signedIn && !profile))) return null;
  if (!ready || (signedIn && (!profile || !ownership))) return <p role="status">Checking course access…</p>;
  if (!signedIn) {
    return <button className="button button-primary" type="button" disabled={busy}
      onClick={() => void signIn(`/courses/${course.slug}`)}>Sign in to buy</button>;
  }
  if (ownership?.failed) return <p role="alert">Could not check course access. Reload the page to try again.</p>;
  if (ownership?.courses?.some(({ id }) => id === course.id)) {
    return <Link className="button button-primary" href="#curriculum-heading">Go to course</Link>;
  }
  if (profile?.role !== ROLE.STUDENT) return null;
  if (!profile.phone?.trim()) {
    return <button className="button button-primary" type="button" onClick={() => edit("phone")}>Add phone number</button>;
  }
  return <Link className="button button-primary" href={`/checkout/${course.slug}`}>Buy for {formatPrice(course.pricePaise)}</Link>;
}
