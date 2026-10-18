import Link from 'next/link';
import styles from './components/layout.module.css';

export default function HomePage() {
  return (
    <div className={styles.homePage}>
      <section className={styles.homeHero}>
        <div className={styles.homeHeroCopy}>
          <p className={styles.homeEyebrow}>The public home of NexGen League</p>
          <h1>Follow the competition.<br />Find your place in it.</h1>
          <p className={styles.homeLead}>
            Discover leagues and seasons, follow the road to match day, and build a competitive identity when you are ready to play.
          </p>
          <div className={styles.homeActions}>
            <Link className={styles.homePrimaryAction} href="/competitions">Explore competitions</Link>
            <Link className={styles.homeSecondaryAction} href="/auth/register?returnTo=%2Fplayer%2Fdashboard">Create League Identity</Link>
          </div>
        </div>
        <div className={styles.homeSignal} aria-label="Competition journey">
          <span>01 / DISCOVER</span>
          <strong>Leagues<br />and seasons</strong>
          <span className={styles.signalRule} />
          <span>02 / FOLLOW</span>
          <strong>Phases, schedules<br />and results</strong>
          <span className={styles.signalRule} />
          <span>03 / COMPETE</span>
          <strong>Your next<br />chapter</strong>
        </div>
      </section>

      <section className={styles.homeRoutes} aria-label="Explore NexGen League">
        <Link href="/competitions" className={styles.homeRoute}>
          <span>01</span><div><h2>Competitions</h2><p>Find published leagues and seasons, open or closed to registration.</p></div><b aria-hidden="true">↗</b>
        </Link>
        <Link href="/career" className={styles.homeRoute}>
          <span>02</span><div><h2>Career</h2><p>See how competition records shape a gamer's journey.</p></div><b aria-hidden="true">↗</b>
        </Link>
        <Link href="/auth/register?returnTo=%2Fplayer%2Fdashboard" className={styles.homeRoute}>
          <span>03</span><div><h2>My League Identity</h2><p>Create your account and start your path into competition.</p></div><b aria-hidden="true">↗</b>
        </Link>
      </section>
    </div>
  );
}
