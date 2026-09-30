"use client";

import { useEffect, useRef } from "react";

/**
 * The email in an iframe as tall as the email, so the page scrolls rather than
 * a box inside it. No scripts ever run in it; same-origin only so its pictures
 * load from this host (an opaque origin may not fetch from a local address).
 */
export function PreviewFrame({ html, title, mobile }: { html: string; title: string; mobile: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const fit = () => {
    const doc = ref.current?.contentDocument;
    if (ref.current && doc?.documentElement) ref.current.style.height = `${doc.documentElement.scrollHeight}px`;
  };
  const watch = () => {
    fit();
    // Pictures arriving late change the height once more.
    ref.current?.contentDocument?.querySelectorAll("img").forEach((img) => img.addEventListener("load", fit));
  };
  // The frame may finish loading before hydration attaches onLoad.
  useEffect(() => {
    if (ref.current?.contentDocument?.readyState === "complete") watch();
  });
  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={html}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={watch}
      className="mx-auto block h-[70rem] border-0 bg-white shadow-sm"
      style={{ width: mobile ? 375 : "100%", maxWidth: mobile ? 375 : 680 }}
    />
  );
}
