import { CourseCard, DemoCard } from "../../components/course/CatalogCards";
import { GoogleSignIn } from "../../components/layout/AcademyHeader";
import { listCourses, listDemos } from "../../lib/api/catalog";

export const dynamic = "force-dynamic";

const benefits = [
  "Expert teachers",
  "Learn at your own pace, lifetime access",
  "Pay once, watch anytime",
];

export default async function HomePage() {
  const [courses, demos] = await Promise.allSettled([listCourses(), listDemos()]);

  return (
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="container hero-inner">
            <h1 id="hero-title">Learn Smarter.<br /><span>Learn Anytime.</span></h1>
            <p>Recorded video courses from expert teachers at Prince Academy, built for focused learning at your own pace.</p>
            <div className="actions">
              <a className="button button-primary" href="#courses">Browse courses</a>
              <GoogleSignIn />
            </div>
          </div>
        </section>
        <div className="container sections">
          <section id="courses" aria-labelledby="courses-title">
            <h2 id="courses-title">Courses</h2>
            {courses.status === "rejected" ? <p className="empty-state">Courses are temporarily unavailable.</p>
              : courses.value.length === 0 ? <p className="empty-state">Courses coming soon</p>
                : <div className="catalog-grid">{courses.value.map((course) => <CourseCard key={course.id} course={course} />)}</div>}
          </section>
          <section id="demos" aria-labelledby="demos-title">
            <h2 id="demos-title">Free demos</h2>
            {demos.status === "rejected" ? <p className="empty-state">Demo lectures are temporarily unavailable.</p>
              : demos.value.length === 0 ? <p className="empty-state">Demo lectures coming soon</p>
                : <div className="catalog-grid">{demos.value.map((demo) => <DemoCard key={demo.id} demo={demo} />)}</div>}
          </section>
          <section className="benefits" aria-labelledby="benefits-title">
            <h2 id="benefits-title">Why Prince Academy</h2>
            <ul>{benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
          </section>
        </div>
      </main>
  );
}
