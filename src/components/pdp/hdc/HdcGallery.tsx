"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The product gallery (pdp.html `.gal`, and the phone frame's `.pim`).
 *
 * Desktop: a column of 84px thumbnails — the first five, then a "+N" tile —
 * beside a square main image with the slanted tags, red arrows and a black
 * zoom button. Phones: every picture in a row that swipes (scroll-snap), with
 * a dot per picture. Both open the same fullscreen viewer.
 *
 * Plain `<img>`: the image optimiser is off site-wide (next.config.ts), so
 * `next/image` would only add wrappers around the CDN file.
 */

export type GalleryTag = { text: string; tone: "ink" | "red" };

const THUMBS = 5;

export function HdcGallery({
  images,
  alt,
  tags,
}: {
  images: Array<{ id: string; url: string }>;
  /** «Milwaukee M18 FPD3-502X Κρουστικό δραπανοκατσάβιδο – 4933479860»; each picture adds «– εικόνα N». */
  alt: string;
  tags: GalleryTag[];
}) {
  const t = useTranslations("pdp.Hdc");
  const altOf = (index: number) => t("eikona_alt", { alt, n: index + 1 });
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState(false);
  const track = useRef<HTMLDivElement | null>(null);
  const count = images.length;

  const move = useCallback(
    (index: number) => setActive(((index % count) + count) % count),
    [count],
  );

  /* The swipe row tells us which picture is showing; the dots follow it. */
  const onSwipe = () => {
    const node = track.current;
    if (!node || node.clientWidth === 0) return;
    setActive(Math.round(node.scrollLeft / node.clientWidth));
  };

  const tagList = tags.length > 0 && (
    <div className="hdc-pdp-tags">
      {tags.map((tag) => (
        <span key={tag.text} className={`hdc-slant hdc-pdp-tag hdc-pdp-tag--${tag.tone}`}>
          {tag.text}
        </span>
      ))}
    </div>
  );

  if (count === 0) {
    return (
      <div className="hdc-pdp-gal hdc-pdp-gal--single">
        <div className="hdc-pdp-main">
          {tagList}
          <span className="hdc-pdp-noimg">{t("choris_eikona")}</span>
        </div>
      </div>
    );
  }

  const more = count - THUMBS;

  return (
    <>
      <div className={`hdc-pdp-gal${count > 1 ? "" : " hdc-pdp-gal--single"}`}>
        {count > 1 && (
          <div className="hdc-pdp-thumbs">
            {images.slice(0, THUMBS).map((image, index) => (
              <button
                key={image.id}
                type="button"
                className={index === active ? "on" : undefined}
                onClick={() => setActive(index)}
                aria-label={t("fotografia", { n: index + 1 })}
                aria-current={index === active}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off */}
                <img src={image.url} alt={altOf(index)} loading="lazy" />
              </button>
            ))}
            {more > 0 && (
              <button
                type="button"
                className={`hdc-pdp-more${active >= THUMBS ? " on" : ""}`}
                onClick={() => {
                  setActive(THUMBS);
                  setViewer(true);
                }}
                aria-label={t("oles_oi_fotografies", { n: count })}
              >
                +{more}
              </button>
            )}
          </div>
        )}

        <div className="hdc-pdp-main">
          {tagList}
          {count > 1 && (
            <>
              <button
                type="button"
                className="hdc-pdp-arr hdc-pdp-arr--prev"
                onClick={() => move(active - 1)}
                aria-label={t("proigoumeni")}
              >
                ‹
              </button>
              <button
                type="button"
                className="hdc-pdp-arr hdc-pdp-arr--next"
                onClick={() => move(active + 1)}
                aria-label={t("epomeni")}
              >
                ›
              </button>
            </>
          )}
          <button
            type="button"
            className="hdc-pdp-frame"
            onClick={() => setViewer(true)}
            aria-label={t("megethynsi")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off */}
            <img src={images[active].url} alt={altOf(active)} fetchPriority="high" />
          </button>
          <button
            type="button"
            className="hdc-pdp-zoom"
            onClick={() => setViewer(true)}
            aria-label={t("megethynsi")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </div>

        {/* Phones: swipe through every picture. */}
        <div className="hdc-pdp-swipe">
          {tagList}
          <div
            ref={track}
            className="hdc-pdp-swipe-track"
            onScroll={onSwipe}
            aria-label={alt}
            role="group"
          >
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => {
                  setActive(index);
                  setViewer(true);
                }}
                aria-label={t("fotografia", { n: index + 1 })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off */}
                <img src={image.url} alt={altOf(index)} loading={index === 0 ? "eager" : "lazy"} />
              </button>
            ))}
          </div>
          {count > 1 && (
            <div className="hdc-pdp-dots" aria-hidden>
              {images.map((image, index) => (
                <i key={image.id} className={index === active ? "on" : undefined} />
              ))}
            </div>
          )}
        </div>
      </div>

      {viewer && (
        <Viewer images={images} active={active} alt={alt} onMove={move} onClose={() => setViewer(false)} />
      )}
    </>
  );
}

/**
 * The fullscreen viewer: arrows, Esc, a strip of every picture. A modal
 * dialog — focus goes to the close button and returns to the page on close.
 */
function Viewer({
  images,
  active,
  alt,
  onMove,
  onClose,
}: {
  images: Array<{ id: string; url: string }>;
  active: number;
  alt: string;
  onMove: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("pdp.Hdc");
  const altOf = (index: number) => t("eikona_alt", { alt, n: index + 1 });
  const close = useRef<HTMLButtonElement | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      previousFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onMove(active + 1);
      if (event.key === "ArrowLeft") onMove(active - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onMove, onClose]);

  /* Keep the current picture's thumbnail in view. */
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active]);

  return (
    <div className="hdc-pdp-viewer" role="dialog" aria-modal="true" aria-label={t("megethynsi")}>
      <div className="hdc-pdp-viewer-bar">
        <span>
          {active + 1} / {images.length}
        </span>
        <button ref={close} type="button" onClick={onClose} aria-label={t("kleisimo")}>
          ×
        </button>
      </div>
      <div className="hdc-pdp-viewer-stage">
        {images.length > 1 && (
          <button
            type="button"
            className="hdc-pdp-arr hdc-pdp-arr--prev"
            onClick={() => onMove(active - 1)}
            aria-label={t("proigoumeni")}
          >
            ‹
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off */}
        <img src={images[active].url} alt={altOf(active)} />
        {images.length > 1 && (
          <button
            type="button"
            className="hdc-pdp-arr hdc-pdp-arr--next"
            onClick={() => onMove(active + 1)}
            aria-label={t("epomeni")}
          >
            ›
          </button>
        )}
      </div>
      {images.length > 1 && (
        <div ref={strip} className="hdc-pdp-viewer-strip">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              data-index={index}
              className={index === active ? "on" : undefined}
              onClick={() => onMove(index)}
              aria-label={t("fotografia", { n: index + 1 })}
              aria-current={index === active}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off */}
              <img src={image.url} alt={altOf(index)} loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
