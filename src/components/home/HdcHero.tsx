"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";

export type HeroSlide = {
  id: string;
  /**
   * The photo, as a real <img> with its size — the page's largest paint, so
   * the first slide's is fetched with high priority instead of being found
   * late in the stylesheet as a background.
   */
  image: string;
  imageWidth: number;
  imageHeight: number;
  tag: string;
  title: string;
  text: string;
  /** "από 318,28 €", already formatted from the live price. */
  price?: string;
  /** The small print after the price. */
  priceNote?: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
};

/**
 * The home hero (mockup `home.html` `.hero`): a 560px photo with a left-to-right
 * scrim, a slanted tag, the big title, one line of copy, the live price, and
 * two buttons.
 *
 * Built as a slider because the mockup is one: slides are a list. The dots and
 * the red arrows only appear when there is more than one slide — controls that
 * lead nowhere read as broken.
 */
export function HdcHero({
  slides,
  labels,
}: {
  slides: HeroSlide[];
  labels: { region: string; prev: string; next: string; slide: string };
}) {
  const [active, setActive] = useState(0);
  if (slides.length === 0) return null;
  const many = slides.length > 1;
  const go = (step: number) => setActive((i) => (i + step + slides.length) % slides.length);

  return (
    <section
      className={many ? "hdc-hero hdc-hero--many" : "hdc-hero"}
      aria-label={labels.region}
      aria-roledescription={many ? "carousel" : undefined}
    >
      {slides.map((slide, i) => (
          <div
            key={slide.id}
            className="hdc-hero-slide"
            hidden={i !== active}
            aria-roledescription={many ? "slide" : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- CDN image; the optimiser is off */}
            <img
              className="hdc-hero-img"
              src={slide.image}
              width={slide.imageWidth}
              height={slide.imageHeight}
              alt=""
              fetchPriority={i === 0 ? "high" : "low"}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
            />
            <div className="hdc-wrap hdc-hero-inner">
              <span className="hdc-slant hdc-hero-tag">{slide.tag}</span>
              {/* The page's H1 is the store itself (HomeIntro); slides are H2. */}
              <h2 className="hdc-disp hdc-hero-title">{slide.title}</h2>
              <p className="hdc-hero-text">{slide.text}</p>
              {slide.price && (
                <p className="hdc-hero-price">
                  {slide.price}
                  {slide.priceNote && <small>{slide.priceNote}</small>}
                </p>
              )}
              <div className="hdc-hero-ctas">
                <Link href={slide.primary.href} className="hdc-btn hdc-btn-red">
                  {slide.primary.label}
                </Link>
                {slide.secondary && (
                  <Link href={slide.secondary.href} className="hdc-btn hdc-btn-ghost">
                    {slide.secondary.label}
                  </Link>
                )}
              </div>
            </div>
          </div>
      ))}

      {many && (
        <>
          <div className="hdc-hero-dots">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`${labels.slide} ${i + 1}`}
                aria-current={i === active}
                onClick={() => setActive(i)}
              />
            ))}
          </div>
          <div className="hdc-hero-ctrl">
            <button type="button" aria-label={labels.prev} onClick={() => go(-1)}>
              ‹
            </button>
            <button type="button" aria-label={labels.next} onClick={() => go(1)}>
              ›
            </button>
          </div>
        </>
      )}
    </section>
  );
}
