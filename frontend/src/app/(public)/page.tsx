import { AcademyHeader, GoogleSignIn } from "../../components/layout/AcademyHeader";
import { AccountProvider } from "../../components/layout/AccountProvider";

const benefits = [
  "Expert teachers",
  "Learn at your own pace, lifetime access",
  "Pay once, watch anytime",
];

export default function HomePage() {
  return (
    <AccountProvider>
      <AcademyHeader />
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
            <p className="empty-state">Courses coming soon</p>
          </section>
          <section id="demos" aria-labelledby="demos-title">
            <h2 id="demos-title">Free demos</h2>
            <p className="empty-state">Demo lectures coming soon</p>
          </section>
          <section className="benefits" aria-labelledby="benefits-title">
            <h2 id="benefits-title">Why Prince Academy</h2>
            <ul>{benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
          </section>
        </div>
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <div><strong>Prince Academy</strong><p>Focused learning at your own pace.</p></div>
          <nav aria-label="Footer"><a href="#courses">Courses</a><a href="#demos">Demos</a></nav>
          <small>© 2026 Prince Academy</small>
        </div>
      </footer>
    </AccountProvider>
  );
}
