import clsx from "clsx";

export function PageShell({ children, wide = false, className = "" }) {
  return (
    <main
      className={clsx(
        "mx-auto w-full px-4 pb-12 pt-6 sm:px-6 lg:px-8",
        wide ? "max-w-[1600px]" : "max-w-7xl",
        className
      )}
    >
      <div className="page-stack">{children}</div>
    </main>
  );
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions = null,
  stats = [],
  imageSrc = "/dashboard-hero.png",
  imageAlt = "Abstract sales dashboard illustration",
  className = "",
  children = null,
}) {
  return (
    <section className={clsx("hero-card", className)}>
      <div className="hero-card__copy">
        {eyebrow ? <p className="hero-card__eyebrow">{eyebrow}</p> : null}
        <div className="space-y-3">
          <h1 className="hero-card__title">{title}</h1>
          {description ? <p className="hero-card__description">{description}</p> : null}
        </div>

        {actions ? <div className="hero-card__actions">{actions}</div> : null}

        {stats.length ? (
          <div className="hero-card__stats">
            {stats.map((stat) => (
              <div key={`${stat.label}-${stat.value}`} className="hero-stat">
                <span className="hero-stat__label">{stat.label}</span>
                <span className="hero-stat__value">{stat.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {children ? <div className="hero-card__slot">{children}</div> : null}
      </div>

      <div className="hero-card__visual">
        <div className="hero-card__glow hero-card__glow--one" aria-hidden="true" />
        <div className="hero-card__glow hero-card__glow--two" aria-hidden="true" />
        <div className="hero-card__image-frame">
          <img src={imageSrc} alt={imageAlt} className="hero-card__image" />
        </div>
      </div>
    </section>
  );
}

export function SectionIntro({
  eyebrow,
  title,
  description,
  actions = null,
  className = "",
}) {
  return (
    <div className={clsx("section-intro", className)}>
      <div className="space-y-2">
        {eyebrow ? <p className="section-intro__eyebrow">{eyebrow}</p> : null}
        <h2 className="section-intro__title">{title}</h2>
        {description ? <p className="section-intro__description">{description}</p> : null}
      </div>
      {actions ? <div className="section-intro__actions">{actions}</div> : null}
    </div>
  );
}
